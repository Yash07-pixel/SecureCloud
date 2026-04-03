from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List
from datetime import datetime


# ─── Auth Schemas ───────────────────────────────

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(..., min_length=8)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name cannot be empty")
        return stripped

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ─── File Schemas ────────────────────────────────

class FileOut(BaseModel):
    id: str
    filename: str
    original_name: str
    owner_email: str
    size: int
    sha256_hash: str
    shared_with: List[str] = []
    uploaded_at: datetime

class ShareFileRequest(BaseModel):
    file_id: str
    share_with_email: EmailStr
    expiry_hours: int

    @field_validator("expiry_hours")
    @classmethod
    def validate_expiry_hours(cls, value: int) -> int:
        allowed_values = {24, 72, 168, 720}
        if value not in allowed_values:
            raise ValueError("Expiry must be one of: 24, 72, 168, or 720 hours")
        return value
