from fastapi import APIRouter, HTTPException, status
from app.schemas.schemas import UserRegister, UserLogin, TokenResponse
from app.core.database import users_collection
from app.core.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", status_code=201)
async def register(user: UserRegister):
    # Check if email already exists
    existing = await users_collection.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Hash the password with bcrypt
    hashed_pw = hash_password(user.password)

    new_user = {
        "name": user.name,
        "email": user.email,
        "password": hashed_pw,
    }

    result = await users_collection.insert_one(new_user)
    return {"message": "User registered successfully", "id": str(result.inserted_id)}


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await users_collection.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    token = create_access_token(data={"sub": user["email"]})
    return {"access_token": token, "token_type": "bearer"}