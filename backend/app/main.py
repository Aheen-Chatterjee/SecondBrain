from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import capture, integrations, items, journal, notifications, profile, tracker, wisdom
from app.schemas import HealthOut


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Second Brain API", lifespan=lifespan)

settings = get_settings()
_origins = settings.cors_origin_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    return HealthOut(status="ok", ai=get_settings().ai_configured)


app.include_router(profile.router)
app.include_router(journal.router)
app.include_router(capture.router)
app.include_router(items.router)
app.include_router(wisdom.router)
app.include_router(tracker.router)
app.include_router(integrations.router)
app.include_router(notifications.router)
