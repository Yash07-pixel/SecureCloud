from fastapi import APIRouter, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.schemas.schemas import UserRegister, UserLogin, TokenResponse
from app.core.database import users_collection
from app.core.security import hash_password, verify_password, create_access_token
from app.utils.encryption import generate_user_key

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", status_code=201)
@limiter.limit("3/minute")
async def register(request: Request, user: UserRegister):
    existing = await users_collection.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pw = hash_password(user.password)
    user_key = generate_user_key()

    new_user = {
        "name": user.name,
        "email": user.email,
        "password": hashed_pw,
        "is_verified": True,
        "encryption_key": user_key,
    }

    await users_collection.insert_one(new_user)
    return {"message": "Registered successfully. You can now login."}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, credentials: UserLogin):
    user = await users_collection.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    token = create_access_token(data={"sub": user["email"], "name": user["name"]})
    return {"access_token": token, "token_type": "bearer"}