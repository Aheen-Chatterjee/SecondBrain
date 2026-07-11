from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite+aiosqlite:///./secondbrain.db"
    SUPABASE_JWT_SECRET: str = ""
    AUTH_DEV_MODE: bool = False
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-5"
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    YOUTUBE_API_KEY: str = ""
    CORS_ORIGINS: str = "*"

    @property
    def cors_origin_list(self) -> list[str]:
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def ai_configured(self) -> bool:
        return bool(self.ANTHROPIC_API_KEY.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
