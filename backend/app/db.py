from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import get_settings

settings = get_settings()

_connect_args = {}
_engine_kwargs = {}
if settings.DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}
    # NullPool avoids reusing a DBAPI connection across event loops, which
    # matters for aiosqlite + test suites that spin up a fresh event loop
    # per test.
    _engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(settings.DATABASE_URL, echo=False, connect_args=_connect_args, **_engine_kwargs)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


def is_sqlite() -> bool:
    return settings.DATABASE_URL.startswith("sqlite")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


async def init_db() -> None:
    """On SQLite (dev), create all tables. On Postgres, assume migrations ran."""
    if is_sqlite():
        import app.models  # noqa: F401  ensure models are registered

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
