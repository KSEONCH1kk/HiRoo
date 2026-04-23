import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from pydantic import BaseModel, Field

from app.core.deps import get_db, get_current_active_user, require_server_admin, require_permission, require_server_member
from app.models.user import User
from app.models.role import Role, MemberRole, Permissions
from app.models.server import ServerMember
from app.services.websocket_service import manager

router = APIRouter(prefix="/api/servers/{server_id}/roles", tags=["roles"])


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field("#99aab5", min_length=4, max_length=9)
    permissions: int = Field(Permissions.DEFAULT, ge=0)
    hoist: bool = False
    mentionable: bool = False


class RoleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    color: str | None = Field(None, min_length=4, max_length=9)
    permissions: int | None = Field(None, ge=0)
    hoist: bool | None = None
    mentionable: bool | None = None
    position: int | None = None


class RoleResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    server_id: uuid.UUID
    name: str
    color: str
    position: int
    permissions: int
    hoist: bool
    mentionable: bool
    is_everyone: bool


class MemberRoleUpdate(BaseModel):
    role_ids: list[uuid.UUID]


@router.get("", response_model=list[RoleResponse])
@router.get("/", response_model=list[RoleResponse], include_in_schema=False)
async def list_roles(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_server_member),
):
    result = await db.execute(
        select(Role).where(Role.server_id == server_id).order_by(Role.position.desc())
    )
    return result.scalars().all()


@router.post("", response_model=RoleResponse, status_code=201)
@router.post("/", response_model=RoleResponse, status_code=201, include_in_schema=False)
async def create_role(
    server_id: uuid.UUID,
    body: RoleCreate,
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
):
    max_pos = await db.execute(
        select(func.coalesce(func.max(Role.position), 0)).where(Role.server_id == server_id)
    )
    role = Role(
        server_id=server_id,
        name=body.name,
        color=body.color,
        permissions=body.permissions,
        hoist=body.hoist,
        mentionable=body.mentionable,
        position=(max_pos.scalar() or 0) + 1,
    )
    db.add(role)
    await db.flush()
    await db.refresh(role)
    from app.services.audit import audit_log
    await audit_log(
        db, server_id, admin.user_id, "role_create",
        target_role_id=role.id, extra={"name": role.name},
    )
    await manager.broadcast_to_server(str(server_id), {
        "event": "role_create",
        "data": RoleResponse.model_validate(role).model_dump(mode="json"),
    })
    return role


@router.patch("/{role_id}", response_model=RoleResponse)
async def update_role(
    server_id: uuid.UUID,
    role_id: uuid.UUID,
    body: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
):
    result = await db.execute(select(Role).where(Role.id == role_id, Role.server_id == server_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    if role.is_everyone and body.name is not None and body.name != role.name:
        raise HTTPException(status_code=400, detail="Роль @everyone нельзя переименовать")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(role, field, value)
    await db.flush()
    from app.services.audit import audit_log
    await audit_log(
        db, server_id, admin.user_id, "role_update",
        target_role_id=role.id,
        extra=body.model_dump(exclude_none=True, mode="json"),
    )
    await manager.broadcast_to_server(str(server_id), {
        "event": "role_update",
        "data": RoleResponse.model_validate(role).model_dump(mode="json"),
    })
    return role


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    server_id: uuid.UUID,
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
):
    result = await db.execute(select(Role).where(Role.id == role_id, Role.server_id == server_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    if role.is_everyone:
        raise HTTPException(status_code=400, detail="Роль @everyone нельзя удалить")
    role_name = role.name
    await db.delete(role)
    from app.services.audit import audit_log
    await audit_log(
        db, server_id, admin.user_id, "role_delete",
        extra={"name": role_name, "role_id": str(role_id)},
    )
    await manager.broadcast_to_server(str(server_id), {
        "event": "role_delete",
        "data": {"server_id": str(server_id), "role_id": str(role_id)},
    })


@router.post("/reorder", status_code=204)
async def reorder_roles(
    server_id: uuid.UUID,
    ordered_ids: list[uuid.UUID],
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
):
    """Set role positions from a top-down list. Higher index = higher
    position (= shown higher in the rail). `@everyone` stays at position 0
    regardless of where the caller placed it."""
    if not ordered_ids:
        return

    res = await db.execute(
        select(Role).where(Role.server_id == server_id, Role.id.in_(ordered_ids))
    )
    by_id = {r.id: r for r in res.scalars()}

    # Role 0 is always @everyone. Convert "frontend top is highest" into
    # backend "higher number is higher" by reversing — last item in list
    # becomes position 1 (above @everyone), first becomes position N.
    ev_res = await db.execute(
        select(Role).where(Role.server_id == server_id, Role.is_everyone == True)
    )
    everyone = ev_res.scalar_one_or_none()
    if everyone:
        everyone.position = 0

    non_everyone = [rid for rid in ordered_ids if not (by_id.get(rid) and by_id[rid].is_everyone)]
    # frontend sends top-to-bottom; rail-top = highest position in DB.
    total = len(non_everyone)
    for idx, rid in enumerate(non_everyone):
        r = by_id.get(rid)
        if r:
            r.position = total - idx  # highest → top

    await db.flush()

    from app.services.audit import audit_log
    await audit_log(
        db, server_id, admin.user_id, "role_reorder",
        extra={"count": len(non_everyone)},
    )

    await manager.broadcast_to_server(str(server_id), {
        "event": "roles_reorder",
        "data": {
            "server_id": str(server_id),
            "ordered_ids": [str(i) for i in ordered_ids],
        },
    })


@router.get("/members/{user_id}", response_model=list[uuid.UUID])
async def get_member_roles(
    server_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(MemberRole.role_id).where(
            MemberRole.server_id == server_id,
            MemberRole.user_id == user_id,
        )
    )
    return [r[0] for r in result.all()]


@router.put("/members/{user_id}", response_model=list[uuid.UUID])
async def set_member_roles(
    server_id: uuid.UUID,
    user_id: uuid.UUID,
    body: MemberRoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
):
    # Validate roles belong to this server
    if body.role_ids:
        result = await db.execute(
            select(Role.id).where(Role.id.in_(body.role_ids), Role.server_id == server_id)
        )
        valid_ids = {r[0] for r in result.all()}
        invalid = set(body.role_ids) - valid_ids
        if invalid:
            raise HTTPException(status_code=400, detail="Некоторые роли не принадлежат этому серверу")

    await db.execute(
        delete(MemberRole).where(MemberRole.server_id == server_id, MemberRole.user_id == user_id)
    )
    for rid in body.role_ids:
        db.add(MemberRole(server_id=server_id, user_id=user_id, role_id=rid))
    await db.flush()
    return body.role_ids
