import os
import tempfile
import uuid

# Must be set before any `app.*` module is imported, since app.config caches
# Settings() via lru_cache and app.db builds the engine at import time.
_TMP_DB = os.path.join(tempfile.gettempdir(), f"secondbrain_test_{uuid.uuid4().hex}.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP_DB}"
os.environ["AUTH_DEV_MODE"] = "true"
os.environ.pop("OPENROUTER_API_KEY", None)
os.environ["SUPABASE_JWT_SECRET"] = ""
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""
os.environ["YOUTUBE_API_KEY"] = ""

import asyncio

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.db import init_db
from app.main import app

DEV_HEADERS = {"Authorization": "Bearer dev"}

# Create tables once, synchronously, before any test's event loop exists.
# NullPool (see app/db.py) means connections aren't reused across loops, so
# it's safe for later tests (each with their own pytest-asyncio event loop)
# to open fresh connections against the same on-disk sqlite file.
asyncio.run(init_db())


def pytest_sessionfinish(session, exitstatus):
    try:
        os.remove(_TMP_DB)
    except OSError:
        pass


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
