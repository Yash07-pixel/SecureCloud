from pydantic import BaseModel, EmailStr
from typing import List
from datetime import datetime

# ─── Auth Schemas ───────────────────────────────

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# ─── File Schemas ───────────────────────────────

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
    