"""
Configuration settings for the AlphaDrop backend.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # CORS
    cors_origins: list[str] = ["*"]

    # Image processing
    max_image_size: int = 10 * 1024 * 1024  # 10MB
    supported_formats: list[str] = ["image/png", "image/jpeg", "image/webp", "image/avif"]

    # Auto-selection thresholds
    entropy_threshold: float = 4.5  # Below this = uniform background
    edge_density_threshold: float = 0.15  # Below this = simple image

    model_config = {"env_prefix": "ALPHADROP_"}


settings = Settings()
