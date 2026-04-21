import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from pydantic import BaseModel, Field

from app.core.deps import get_db, get_current_active_user, require_server_admin, require_permission, require_server_member
from app.models.user import User
from app.models.role import Role, MemberRole, Permissions
from app.models.server import ServerMember

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
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
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
    return role


@router.patch("/{role_id}", response_model=RoleResponse)
async def update_role(
    server_id: uuid.UUID,
    role_id: uuid.UUID,
    body: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
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
    return role


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    server_id: uuid.UUID,
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
):
    result = await db.execute(select(Role).where(Role.id == role_id, Role.server_id == server_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    if role.is_everyone:
        raise HTTPException(status_code=400, detail="Роль @everyone нельзя удалить")
    await db.delete(role)


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
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
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
