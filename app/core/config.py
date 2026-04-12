from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    MONGO_URI: str
    DB_NAME: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    AES_SECRET_KEY: str
    UPLOAD_DIR: str = "encrypted_files"
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REDIRECT_URI: str | None = None
    FRONTEND_URL: str = "http://localhost:3000"


    class Config:
        env_file = ".env"

settings = Settings()
