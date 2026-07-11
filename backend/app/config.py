from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite+aiosqlite:///./secondbrain.db"
    SUPABASE_JWT_SECRET: str = ""
    AUTH_DEV_MODE: bool = False
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "deepseek/deepseek-chat-v3.1"
    # DeepSeek is text-only; snap-a-page OCR uses this vision-capable model.
    OPENROUTER_VISION_MODEL: str = "qwen/qwen2.5-vl-72b-instruct"
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
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
        return bool(self.OPENROUTER_API_KEY.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
