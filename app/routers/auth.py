from urllib.parse import urlencode

import requests
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pymongo.errors import DuplicateKeyError
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings
from app.schemas.schemas import UserRegister, UserLogin, TokenResponse
from app.core.database import users_collection
from app.core.security import hash_password, verify_password, create_access_token
from app.utils.encryption import generate_user_key

limiter = Limiter(key_func=get_remote_address)
state_serializer = URLSafeTimedSerializer(settings.SECRET_KEY, salt="google-oauth-state")

router = APIRouter(prefix="/auth", tags=["Authentication"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def get_frontend_url(path: str, **query_params: str) -> str:
    base_url = settings.FRONTEND_URL.rstrip("/")
    query = urlencode({key: value for key, value in query_params.items() if value})
    return f"{base_url}{path}?{query}" if query else f"{base_url}{path}"


def ensure_google_auth_configured() -> None:
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET or not settings.GOOGLE_REDIRECT_URI:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured",
        )


def exchange_google_code_for_tokens(code: str) -> dict:
    response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def fetch_google_userinfo(access_token: str) -> dict:
    response = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


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
        "is_verified": True,
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

    if not user.get("password"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google sign-in. Continue with Google instead."
        )

    if not verify_password(credentials.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    token = create_access_token(data={"sub": user["email"], "name": user["name"]})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/google/login")
@limiter.limit("10/minute")
async def google_login(request: Request):
    ensure_google_auth_configured()
    state = state_serializer.dumps({"provider": "google"})
    query = urlencode(
        {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{query}", status_code=status.HTTP_302_FOUND)


@router.get("/google/callback")
@limiter.limit("10/minute")
async def google_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    ensure_google_auth_configured()

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
        state_serializer.loads(state, max_age=600)
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
            "is_verified": True,
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

    token = create_access_token(data={"sub": email, "name": user_record["name"]})
    return RedirectResponse(
        url=get_frontend_url("/auth/google/callback", token=token),
        status_code=status.HTTP_302_FOUND,
    )
