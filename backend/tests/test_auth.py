import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.database import Base, get_db
from app.core.deps import get_redis

TEST_DB_URL = "postgresql+asyncpg://hiroo:hiroo@localhost:5432/hiroo_test"

engine = create_async_engine(TEST_DB_URL, echo=False)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def override_db():
    async with TestSession() as s:
        yield s


class FakeRedis:
    def __init__(self):
        self._store: dict = {}

    async def get(self, key):
        return self._store.get(key)

    async def setex(self, key, ttl, value):
        self._store[key] = value

    async def set(self, key, value):
        self._store[key] = value


fake_redis = FakeRedis()


async def override_redis():
    return fake_redis


app.dependency_overrides[get_db] = override_db
app.dependency_overrides[get_redis] = override_redis


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    fake_redis._store.clear()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_register_success(client):
    r = await client.post("/api/auth/register", json={
        "username": "testuser", "email": "test@example.com", "password": "Password1"
    })
    assert r.status_code == 201
    data = r.json()
    assert "access_token" in data
    assert data["user"]["username"] == "testuser"


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    payload = {"username": "user1", "email": "dup@example.com", "password": "Password1"}
    await client.post("/api/auth/register", json=payload)
    payload["username"] = "user2"
    r = await client.post("/api/auth/register", json=payload)
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_register_weak_password(client):
    r = await client.post("/api/auth/register", json={
        "username": "weakuser", "email": "w@example.com", "password": "short"
    })
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client):
    await client.post("/api/auth/register", json={
        "username": "loginuser", "email": "login@example.com", "password": "Password1"
    })
    r = await client.post("/api/auth/login", json={"email": "login@example.com", "password": "Password1"})
    assert r.status_code == 200
    assert "access_token" in r.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post("/api/auth/register", json={
        "username": "badpass", "email": "bad@example.com", "password": "Password1"
    })
    r = await client.post("/api/auth/login", json={"email": "bad@example.com", "password": "WrongPass9"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_logout_blacklists_token(client):
    reg = await client.post("/api/auth/register", json={
        "username": "logoutuser", "email": "logout@example.com", "password": "Password1"
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.post("/api/auth/logout", headers=headers)
    assert r.status_code == 204

    r = await client.get("/api/auth/me", headers=headers)
    assert r.status_code == 401
