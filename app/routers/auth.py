from fastapi import APIRouter, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timedelta
from app.schemas.schemas import UserRegister, UserLogin, TokenResponse
from app.core.database import users_collection
from app.core.security import hash_password, verify_password, create_access_token
from app.utils.email import generate_otp, send_otp_email
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
    otp = generate_otp()
    otp_expiry = datetime.utcnow() + timedelta(minutes=10)
    user_key = generate_user_key()

    new_user = {
        "name": user.name,
        "email": user.email,
        "password": hashed_pw,
        "is_verified": False,
        "otp": otp,
        "otp_expiry": otp_expiry,
        "encryption_key": user_key,
    }

    await users_collection.insert_one(new_user)

    try:
        await send_otp_email(user.email, otp)
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        raise HTTPException(status_code=500, detail="Failed to send OTP email. Check your SMTP config.")

    return {"message": "Registered successfully. OTP sent to your email."}


@router.post("/verify-otp")
@limiter.limit("5/minute")
async def verify_otp(request: Request, email: str, otp: str):
    user = await users_collection.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.get("is_verified"):
        return {"message": "Account already verified. Please login."}

    if user.get("otp") != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    if datetime.utcnow() > user.get("otp_expiry"):
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    await users_collection.update_one(
        {"email": email},
        {"$set": {"is_verified": True}, "$unset": {"otp": "", "otp_expiry": ""}}
    )

    return {"message": "Email verified successfully! You can now login."}


@router.post("/resend-otp")
@limiter.limit("2/minute")
async def resend_otp(request: Request, email: str):
    user = await users_collection.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.get("is_verified"):
        return {"message": "Account already verified. Please login."}

    otp = generate_otp()
    otp_expiry = datetime.utcnow() + timedelta(minutes=10)

    await users_collection.update_one(
        {"email": email},
        {"$set": {"otp": otp, "otp_expiry": otp_expiry}}
    )

    try:
        await send_otp_email(user["email"], otp)
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        raise HTTPException(status_code=500, detail="Failed to send OTP email.")

    return {"message": "New OTP sent to your email."}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, credentials: UserLogin):
    user = await users_collection.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    if not user.get("is_verified", False):
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Please verify your OTP first."
        )

    token = create_access_token(data={"sub": user["email"], "name": user["name"]})
    return {"access_token": token, "token_type": "bearer"}