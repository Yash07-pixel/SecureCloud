import json
import uuid
from urllib.parse import urlencode

import requests
from itsdangerous import URLSafeTimedSerializer

from app.core.config import settings

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TOKEN_REVOCATION_URL = "https://oauth2.googleapis.com/revoke"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"

oauth_state_serializer = URLSafeTimedSerializer(settings.SECRET_KEY, salt="google-oauth-state")


def ensure_google_auth_configured() -> None:
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET or not settings.GOOGLE_REDIRECT_URI:
        raise ValueError("Google OAuth is not configured")


def get_frontend_url(path: str, **query_params: str) -> str:
    base_url = settings.FRONTEND_URL.rstrip("/")
    query = urlencode({key: value for key, value in query_params.items() if value})
    return f"{base_url}{path}?{query}" if query else f"{base_url}{path}"


def create_oauth_state(payload: dict) -> str:
    return oauth_state_serializer.dumps(payload)


def load_oauth_state(state: str, max_age: int = 600) -> dict:
    return oauth_state_serializer.loads(state, max_age=max_age)


def build_google_oauth_url(
    *,
    scopes: list[str],
    state: str,
    prompt: str = "select_account",
    access_type: str | None = None,
    include_granted_scopes: bool = False,
) -> str:
    ensure_google_auth_configured()
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(scopes),
        "state": state,
        "prompt": prompt,
    }
    if access_type:
        params["access_type"] = access_type
    if include_granted_scopes:
        params["include_granted_scopes"] = "true"
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def exchange_google_code_for_tokens(code: str) -> dict:
    ensure_google_auth_configured()
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


def refresh_google_access_token(refresh_token: str) -> dict:
    ensure_google_auth_configured()
    response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def revoke_google_token(token: str) -> None:
    ensure_google_auth_configured()
    response = requests.post(
        GOOGLE_TOKEN_REVOCATION_URL,
        data={"token": token},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=15,
    )
    response.raise_for_status()


def fetch_google_userinfo(access_token: str) -> dict:
    response = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def upload_drive_file(access_token: str, filename: str, content: bytes, mime_type: str = "application/octet-stream") -> dict:
    boundary = f"securecloud-{uuid.uuid4().hex}"
    metadata = json.dumps({"name": filename})
    body = (
        f"--{boundary}\r\n"
        "Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{metadata}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode("utf-8") + content + f"\r\n--{boundary}--".encode("utf-8")

    response = requests.post(
        f"{GOOGLE_DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": f"multipart/related; boundary={boundary}",
        },
        data=body,
        timeout=60,
    )
    response.raise_for_status()
    return response.json()


def download_drive_file(access_token: str, file_id: str) -> bytes:
    response = requests.get(
        f"{GOOGLE_DRIVE_FILES_URL}/{file_id}",
        params={"alt": "media"},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=60,
    )
    response.raise_for_status()
    return response.content


def delete_drive_file(access_token: str, file_id: str) -> None:
    response = requests.delete(
        f"{GOOGLE_DRIVE_FILES_URL}/{file_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    response.raise_for_status()
