from fastapi import APIRouter, Depends, HTTPException

from app.core.database import files_collection, users_collection
from app.core.security import get_current_user
from app.utils.google_oauth import GOOGLE_DRIVE_SCOPE, build_google_oauth_url, create_oauth_state

router = APIRouter(prefix="/drive", tags=["Google Drive"])


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
async def disconnect_drive(current_user: dict = Depends(get_current_user)):
    drive_backed_files = await files_collection.count_documents(
        {
            "owner_email": current_user["email"],
            "storage_provider": "google_drive",
        }
    )
    if drive_backed_files:
        raise HTTPException(
            status_code=400,
            detail="Delete or move your Google Drive-backed files before disconnecting Drive.",
        )

    result = await users_collection.update_one(
        {"email": current_user["email"]},
        {"$unset": {"google_drive": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Google Drive disconnected"}
