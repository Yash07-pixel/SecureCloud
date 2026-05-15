from datetime import datetime, timedelta, timezone

import requests
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, SignatureExpired
from pymongo.errors import DuplicateKeyError
from app.schemas.schemas import RefreshTokenRequest, UserRegister, UserLogin, TokenResponse
from app.core.database import token_sessions_collection, users_collection
from app.core.rate_limit import limiter
from app.core.security import (
    REFRESH_TOKEN_TYPE,
    create_token_pair,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.utils.encryption import encrypt_text
from app.utils.google_oauth import (
    GOOGLE_DRIVE_SCOPE,
    build_google_oauth_url,
    create_oauth_state,
    ensure_google_auth_configured,
    exchange_google_code_for_tokens,
    fetch_google_userinfo,
    get_frontend_url,
    load_oauth_state,
)
from app.utils.encryption import generate_user_key

router = APIRouter(prefix="/auth", tags=["Authentication"])

MAX_FAILED_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 15


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def issue_tokens_for_user(user: dict) -> dict:
    token_pair = create_token_pair({"sub": user["email"], "name": user["name"]})
    await token_sessions_collection.insert_one(
        {
            "jti": token_pair["refresh_jti"],
            "user_email": user["email"],
            "token_hash": hash_token(token_pair["refresh_token"]),
            "created_at": utc_now(),
            "expires_at": token_pair["refresh_expires_at"],
            "revoked_at": None,
            "replaced_by_jti": None,
        }
    )
    return {
        "access_token": token_pair["access_token"],
        "refresh_token": token_pair["refresh_token"],
        "token_type": "bearer",
    }


@router.post("/register", status_code=201)
@limiter.limit("3/minute")
async def register(request: Request, user: UserRegister):
    email = user.email.lower()

    existing = await users_collection.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pw = hash_password(user.password)
    user_key = generate_user_key()

    new_user = {
        "name": user.name,
        "email": email,
        "password": hashed_pw,
        "encryption_key": user_key,
    }

    try:
        await users_collection.insert_one(new_user)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")

    return {"message": "Registered successfully. You can now login."}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, credentials: UserLogin):
    email = credentials.email.lower()
    user = await users_collection.find_one({"email": email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    now = utc_now()
    lockout_until = normalize_utc(user.get("lockout_until"))
    if lockout_until and lockout_until > now:
        remaining_minutes = max(1, int((lockout_until - now).total_seconds() / 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Try again in {remaining_minutes} minute(s).",
        )

    if not user.get("password"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google sign-in. Continue with Google instead."
        )

    if not verify_password(credentials.password, user["password"]):
        current_failed_attempts = int(user.get("failed_login_attempts", 0))
        if lockout_until and lockout_until <= now:
            current_failed_attempts = 0

        failed_attempts = current_failed_attempts + 1
        update_fields = {"failed_login_attempts": failed_attempts}
        if failed_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
            update_fields["lockout_until"] = now + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
        await users_collection.update_one({"_id": user["_id"]}, {"$set": update_fields})

        if failed_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Try again in {LOGIN_LOCKOUT_MINUTES} minute(s).",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    await users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"failed_login_attempts": 0}, "$unset": {"lockout_until": ""}},
    )

    return await issue_tokens_for_user(user)


@router.get("/google/login")
@limiter.limit("10/minute")
async def google_login(request: Request):
    try:
        state = create_oauth_state({"flow": "login"})
        auth_url = build_google_oauth_url(scopes=["openid", "email", "profile"], state=state)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured",
        )
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get("/google/callback")
@limiter.limit("10/minute")
async def google_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    try:
        ensure_google_auth_configured()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured",
        )

    if error:
        return RedirectResponse(
            url=get_frontend_url("/auth/google/callback", error="Google sign-in was cancelled or denied."),
            status_code=status.HTTP_302_FOUND,
        )

    if not code or not state:
        return RedirectResponse(
            url=get_frontend_url("/auth/google/callback", error="Google sign-in did not return the required information."),
            status_code=status.HTTP_302_FOUND,
        )

    try:
        oauth_state = load_oauth_state(state, max_age=600)
    except SignatureExpired:
        return RedirectResponse(
            url=get_frontend_url("/auth/google/callback", error="Google sign-in expired. Please try again."),
            status_code=status.HTTP_302_FOUND,
        )
    except BadSignature:
        return RedirectResponse(
            url=get_frontend_url("/auth/google/callback", error="Invalid Google sign-in state."),
            status_code=status.HTTP_302_FOUND,
        )

    try:
        token_data = await run_in_threadpool(exchange_google_code_for_tokens, code)
        userinfo = await run_in_threadpool(fetch_google_userinfo, token_data["access_token"])
    except requests.RequestException:
        return RedirectResponse(
            url=get_frontend_url("/auth/google/callback", error="Google sign-in failed while contacting Google."),
            status_code=status.HTTP_302_FOUND,
        )

    if oauth_state.get("flow") == "drive":
        user_email = (oauth_state.get("email") or "").lower()
        refresh_token = token_data.get("refresh_token")
        drive_email = (userinfo.get("email") or "").lower()

        if not user_email:
            return RedirectResponse(
                url=get_frontend_url("/dashboard", drive="error", message="Drive connection request was invalid."),
                status_code=status.HTTP_302_FOUND,
            )

        current_user = await users_collection.find_one({"email": user_email})
        if not current_user:
            return RedirectResponse(
                url=get_frontend_url("/dashboard", drive="error", message="SecureCloud account was not found."),
                status_code=status.HTTP_302_FOUND,
            )
        if drive_email != user_email:
            return RedirectResponse(
                url=get_frontend_url(
                    "/dashboard",
                    drive="error",
                    message="Google Drive account email must match your SecureCloud account email.",
                ),
                status_code=status.HTTP_302_FOUND,
            )

        existing_drive_info = current_user.get("google_drive", {})
        encrypted_refresh_token = existing_drive_info.get("refresh_token")
        if refresh_token:
            encrypted_refresh_token = encrypt_text(refresh_token)

        if not encrypted_refresh_token:
            return RedirectResponse(
                url=get_frontend_url("/dashboard", drive="error", message="Google Drive did not return offline access. Please try again."),
                status_code=status.HTTP_302_FOUND,
            )

        await users_collection.update_one(
            {"_id": current_user["_id"]},
            {
                "$set": {
                    "google_drive": {
                        "email": drive_email,
                        "scope": token_data.get("scope", GOOGLE_DRIVE_SCOPE),
                        "refresh_token": encrypted_refresh_token,
                        "connected_at": datetime.now(timezone.utc).isoformat(),
                    }
                }
            },
        )

        return RedirectResponse(
            url=get_frontend_url("/dashboard", drive="connected"),
            status_code=status.HTTP_302_FOUND,
        )

    email = (userinfo.get("email") or "").lower()
    google_sub = userinfo.get("sub")
    name = (userinfo.get("name") or email.split("@")[0]).strip()

    if not email or not google_sub or not userinfo.get("email_verified"):
        return RedirectResponse(
            url=get_frontend_url("/auth/google/callback", error="Google account email is not verified."),
            status_code=status.HTTP_302_FOUND,
        )

    existing_user = await users_collection.find_one({"email": email})

    if existing_user and existing_user.get("google_sub") and existing_user["google_sub"] != google_sub:
        return RedirectResponse(
            url=get_frontend_url("/auth/google/callback", error="This email is already linked to a different Google account."),
            status_code=status.HTTP_302_FOUND,
        )

    if existing_user:
        update_fields = {}
        if not existing_user.get("google_sub"):
            update_fields["google_sub"] = google_sub
        if not existing_user.get("name") and name:
            update_fields["name"] = name
        if update_fields:
            await users_collection.update_one({"_id": existing_user["_id"]}, {"$set": update_fields})
        user_record = {**existing_user, **update_fields}
    else:
        user_record = {
            "name": name,
            "email": email,
            "password": None,
            "encryption_key": generate_user_key(),
            "auth_provider": "google",
            "google_sub": google_sub,
        }
        try:
            await users_collection.insert_one(user_record)
        except DuplicateKeyError:
            return RedirectResponse(
                url=get_frontend_url("/auth/google/callback", error="An account with this email already exists. Please try again."),
                status_code=status.HTTP_302_FOUND,
            )

    token_pair = await issue_tokens_for_user(user_record)
    return RedirectResponse(
        url=get_frontend_url(
            "/auth/google/callback",
            token=token_pair["access_token"],
            refresh_token=token_pair["refresh_token"],
        ),
        status_code=status.HTTP_302_FOUND,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(payload: RefreshTokenRequest):
    token_payload = decode_token(payload.refresh_token, expected_type=REFRESH_TOKEN_TYPE)
    session = await token_sessions_collection.find_one({"jti": token_payload["jti"]})
    if not session or session.get("revoked_at"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is invalid")

    if session.get("token_hash") != hash_token(payload.refresh_token):
        await token_sessions_collection.update_one(
            {"_id": session["_id"]},
            {"$set": {"revoked_at": utc_now()}},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is invalid")

    user = await users_collection.find_one({"email": token_payload.get("sub")})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    new_token_pair = create_token_pair({"sub": user["email"], "name": user["name"]})
    now = utc_now()
    await token_sessions_collection.update_one(
        {"_id": session["_id"]},
        {"$set": {"revoked_at": now, "replaced_by_jti": new_token_pair["refresh_jti"]}},
    )
    await token_sessions_collection.insert_one(
        {
            "jti": new_token_pair["refresh_jti"],
            "user_email": user["email"],
            "token_hash": hash_token(new_token_pair["refresh_token"]),
            "created_at": now,
            "expires_at": new_token_pair["refresh_expires_at"],
            "revoked_at": None,
            "replaced_by_jti": None,
        }
    )
    return {
        "access_token": new_token_pair["access_token"],
        "refresh_token": new_token_pair["refresh_token"],
        "token_type": "bearer",
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshTokenRequest):
    token_payload = decode_token(payload.refresh_token, expected_type=REFRESH_TOKEN_TYPE, verify_exp=False)
    await token_sessions_collection.update_one(
        {"jti": token_payload["jti"]},
        {"$set": {"revoked_at": utc_now()}},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
