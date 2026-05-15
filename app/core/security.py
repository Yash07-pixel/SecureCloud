import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.config import settings

# Password hashing with bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def _build_token_payload(data: dict, expires_delta: timedelta, token_type: str) -> dict:
    now = utc_now()
    payload = data.copy()
    payload.update({
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": now,
        "nbf": now,
        "exp": now + expires_delta,
        "jti": uuid.uuid4().hex,
        "type": token_type,
    })
    return payload

def create_access_token(data: dict) -> str:
    payload = _build_token_payload(
        data,
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        ACCESS_TOKEN_TYPE,
    )
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def create_refresh_token(data: dict) -> str:
    payload = _build_token_payload(
        data,
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        REFRESH_TOKEN_TYPE,
    )
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def create_token_pair(data: dict) -> dict:
    access_token = create_access_token(data)
    refresh_token = create_refresh_token(data)
    refresh_payload = decode_token(refresh_token, expected_type=REFRESH_TOKEN_TYPE)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "refresh_jti": refresh_payload["jti"],
        "refresh_expires_at": datetime.fromtimestamp(refresh_payload["exp"], tz=timezone.utc),
    }

def decode_access_token(token: str) -> dict:
    return decode_token(token, expected_type=ACCESS_TOKEN_TYPE)

def decode_token(token: str, expected_type: str | None = None, verify_exp: bool = True) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
            options={"verify_exp": verify_exp},
        )
        if expected_type and payload.get("type") != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

async def get_current_user(token: str = Depends(oauth2_scheme)):
    from app.core.database import users_collection
    payload = decode_access_token(token)
    email: str = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = await users_collection.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
