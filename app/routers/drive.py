import logging
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.core.database import files_collection, users_collection
from app.core.security import get_current_user
from app.utils.encryption import decrypt_text
from app.utils.google_oauth import (
    GOOGLE_DRIVE_SCOPE,
    build_google_oauth_url,
    create_oauth_state,
    revoke_google_token,
)

router = APIRouter(prefix="/drive", tags=["Google Drive"])
logger = logging.getLogger(__name__)


@router.get("/status")
async def drive_status(current_user: dict = Depends(get_current_user)):
    user = await users_collection.find_one({"email": current_user["email"]})
    drive_info = user.get("google_drive", {}) if user else {}
    return {
        "connected": bool(drive_info.get("refresh_token")),
        "drive_email": drive_info.get("email"),
        "connected_at": drive_info.get("connected_at"),
    }


@router.get("/connect")
async def connect_drive(current_user: dict = Depends(get_current_user)):
    try:
        state = create_oauth_state({"flow": "drive", "email": current_user["email"]})
        auth_url = build_google_oauth_url(
            scopes=[GOOGLE_DRIVE_SCOPE],
            state=state,
            prompt="consent",
            access_type="offline",
            include_granted_scopes=True,
        )
    except ValueError:
        raise HTTPException(status_code=503, detail="Google Drive is not configured")
    return {"auth_url": auth_url}


@router.post("/disconnect")
async def disconnect_drive(force: bool = False, current_user: dict = Depends(get_current_user)):
    user = await users_collection.find_one({"email": current_user["email"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    drive_backed_files = await files_collection.count_documents(
        {
            "owner_email": current_user["email"],
            "storage_provider": "google_drive",
        }
    )
    if drive_backed_files and not force:
        raise HTTPException(
            status_code=400,
            detail="Delete, move, or force-disconnect your Google Drive-backed files before disconnecting Drive.",
        )

    drive_info = user.get("google_drive") or {}
    encrypted_refresh_token = drive_info.get("refresh_token")
    if encrypted_refresh_token:
        try:
            refresh_token = decrypt_text(encrypted_refresh_token)
            await run_in_threadpool(revoke_google_token, refresh_token)
        except requests.HTTPError as exc:
            if exc.response is None or exc.response.status_code != 400:
                logger.warning(
                    "Google token revocation failed for user %s with status %s",
                    current_user["email"],
                    exc.response.status_code if exc.response is not None else "unknown",
                )
                raise HTTPException(status_code=502, detail="Could not disconnect Google Drive")
        except requests.RequestException:
            logger.warning("Google token revocation request failed for user %s", current_user["email"])
            raise HTTPException(status_code=502, detail="Could not disconnect Google Drive")

    if drive_backed_files and force:
        await files_collection.update_many(
            {
                "owner_email": current_user["email"],
                "storage_provider": "google_drive",
            },
            {
                "$set": {
                    "storage_provider": "google_drive_unlinked",
                    "drive_disconnected_at": datetime.now(timezone.utc).isoformat(),
                    "drive_connected_at": drive_info.get("connected_at"),
                },
            },
        )

    await users_collection.update_one(
        {"_id": user["_id"]},
        {"$unset": {"google_drive": ""}},
    )
    if drive_backed_files and force:
        return {"message": "Google Drive disconnected. Existing Drive-backed files were marked unavailable."}
    return {"message": "Google Drive disconnected"}
