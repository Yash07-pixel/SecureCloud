import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from bson import ObjectId
from bson.errors import InvalidId
import requests
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.security import get_current_user
from app.core.database import files_collection, users_collection
from app.schemas.schemas import ShareFileRequest
from app.utils.validation import validate_file
from app.utils.encryption import (
    encrypt_file, decrypt_file,
    compute_sha256,
    decrypt_text,
    save_encrypted_file, load_encrypted_file,
)
from app.utils.google_oauth import (
    delete_drive_file,
    download_drive_file,
    refresh_google_access_token,
    upload_drive_file,
)

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/files", tags=["Files"])


def parse_file_id(file_id: str) -> ObjectId:
    try:
        return ObjectId(file_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid file ID")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_utc_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def get_drive_refresh_token(user_doc: dict) -> str | None:
    drive_info = user_doc.get("google_drive") or {}
    refresh_token = drive_info.get("refresh_token")
    if not refresh_token:
        return None
    return decrypt_text(refresh_token)


async def get_drive_access_token(user_doc: dict) -> str:
    refresh_token = get_drive_refresh_token(user_doc)
    if not refresh_token:
        raise HTTPException(status_code=409, detail="Google Drive is not connected for this account")

    try:
        token_data = await run_in_threadpool(refresh_google_access_token, refresh_token)
    except requests.HTTPError as exc:
        detail = exc.response.text if exc.response is not None and exc.response.text else "Could not refresh Google Drive access"
        raise HTTPException(status_code=502, detail=detail)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Could not refresh Google Drive access")

    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="Google Drive did not return an access token")
    return access_token


async def load_stored_payload(file_doc: dict, owner_doc: dict) -> tuple[bytes, bytes]:
    storage_provider = file_doc.get("storage_provider", "local")

    if storage_provider == "google_drive":
        drive_file_id = file_doc.get("drive_file_id")
        if not drive_file_id:
            raise HTTPException(status_code=404, detail="Stored file reference is missing")

        access_token = await get_drive_access_token(owner_doc)
        try:
            raw_payload = await run_in_threadpool(download_drive_file, access_token, drive_file_id)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                raise HTTPException(status_code=404, detail="Stored file is unavailable in Google Drive")
            detail = exc.response.text if exc.response is not None and exc.response.text else "Could not download file from Google Drive"
            raise HTTPException(status_code=502, detail=detail)
        except requests.RequestException:
            raise HTTPException(status_code=502, detail="Could not download file from Google Drive")

        if len(raw_payload) < 16:
            raise HTTPException(status_code=500, detail="Stored file payload is invalid")

        return raw_payload[16:], raw_payload[:16]

    storage_path = file_doc.get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Stored file path is missing")

    try:
        return load_encrypted_file(storage_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Stored file is unavailable on the server")


@router.post("/upload", status_code=201)
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    raw_bytes = await validate_file(file)
    sha256 = compute_sha256(raw_bytes)
    user_doc = await users_collection.find_one({"email": current_user["email"]})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User account not found")
    user_key = user_doc.get("encryption_key")
    encrypted_data, iv = encrypt_file(raw_bytes, hex_key=user_key)
    stored_filename = f"{uuid.uuid4().hex}_{file.filename}"
    encrypted_payload = iv + encrypted_data

    storage_provider = "local"
    filepath = None
    drive_file_id = None

    if get_drive_refresh_token(user_doc):
        access_token = await get_drive_access_token(user_doc)
        try:
            drive_file = await run_in_threadpool(
                upload_drive_file,
                access_token,
                stored_filename,
                encrypted_payload,
            )
        except requests.HTTPError as exc:
            detail = exc.response.text if exc.response is not None and exc.response.text else "Could not upload encrypted file to Google Drive"
            raise HTTPException(status_code=502, detail=detail)
        except requests.RequestException:
            raise HTTPException(status_code=502, detail="Could not upload encrypted file to Google Drive")

        storage_provider = "google_drive"
        drive_file_id = drive_file.get("id")
    else:
        filepath = save_encrypted_file(stored_filename, encrypted_data, iv)

    doc = {
        "filename": stored_filename,
        "original_name": file.filename,
        "owner_email": current_user["email"],
        "size": len(raw_bytes),
        "sha256_hash": sha256,
        "storage_path": filepath,
        "storage_provider": storage_provider,
        "drive_file_id": drive_file_id,
        "shared_with": [],
        "share_expiry_list": [],
        "trashed": False,
        "starred": False,
        "uploaded_at": utc_now(),
    }
    result = await files_collection.insert_one(doc)
    return {
        "message": "File uploaded and encrypted successfully",
        "file_id": str(result.inserted_id),
        "sha256_hash": sha256,
    }


@router.get("/")
async def list_files(current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    cursor = files_collection.find({
        "owner_email": email,
        "trashed": {"$ne": True}
    })
    files = []
    async for doc in cursor:
        files.append({
            "id": str(doc["_id"]),
            "original_name": doc["original_name"],
            "owner_email": doc["owner_email"],
            "size": doc["size"],
            "sha256_hash": doc["sha256_hash"],
            "storage_provider": doc.get("storage_provider", "local"),
            "shared_with": doc.get("shared_with", []),
            "starred": doc.get("starred", False),
            "uploaded_at": doc["uploaded_at"],
            "is_owner": True,
        })
    return files


@router.get("/shared")
async def shared_with_me(current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    now = utc_now()
    cursor = files_collection.find({
        "shared_with": email,
        "trashed": {"$ne": True}
    })
    files = []
    async for doc in cursor:
        expiry = None
        expiry_list = doc.get("share_expiry_list", [])
        for item in expiry_list:
            if item.get("email") == email:
                expiry = item.get("expiry")
                break

        if expiry and parse_utc_datetime(expiry) < now:
            continue

        hours_remaining = None
        if expiry:
            diff = parse_utc_datetime(expiry) - utc_now()
            hours_remaining = max(0, int(diff.total_seconds() / 3600))

        files.append({
            "id": str(doc["_id"]),
            "original_name": doc["original_name"],
            "owner_email": doc["owner_email"],
            "size": doc["size"],
            "sha256_hash": doc["sha256_hash"],
            "storage_provider": doc.get("storage_provider", "local"),
            "shared_with": doc.get("shared_with", []),
            "uploaded_at": doc["uploaded_at"],
            "is_owner": False,
            "expiry": expiry,
            "hours_remaining": hours_remaining,
        })
    return files


@router.get("/starred")
async def starred_files(current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    cursor = files_collection.find({
        "owner_email": email,
        "starred": True,
        "trashed": {"$ne": True}
    })
    files = []
    async for doc in cursor:
        files.append({
            "id": str(doc["_id"]),
            "original_name": doc["original_name"],
            "owner_email": doc["owner_email"],
            "size": doc["size"],
            "sha256_hash": doc["sha256_hash"],
            "storage_provider": doc.get("storage_provider", "local"),
            "shared_with": doc.get("shared_with", []),
            "starred": doc.get("starred", False),
            "uploaded_at": doc["uploaded_at"],
            "is_owner": True,
        })
    return files


@router.get("/trash")
async def trashed_files(current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    cursor = files_collection.find({
        "owner_email": email,
        "trashed": True
    })
    files = []
    async for doc in cursor:
        files.append({
            "id": str(doc["_id"]),
            "original_name": doc["original_name"],
            "owner_email": doc["owner_email"],
            "size": doc["size"],
            "sha256_hash": doc["sha256_hash"],
            "storage_provider": doc.get("storage_provider", "local"),
            "uploaded_at": doc["uploaded_at"],
        })
    return files


@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    object_id = parse_file_id(file_id)
    doc = await files_collection.find_one({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    email = current_user["email"]
    is_owner = doc["owner_email"] == email
    is_shared = email in doc.get("shared_with", [])

    if not is_owner and not is_shared:
        raise HTTPException(status_code=403, detail="Access denied")

    if not is_owner and is_shared:
        expiry = None
        expiry_list = doc.get("share_expiry_list", [])
        for item in expiry_list:
            if item.get("email") == email:
                expiry = item.get("expiry")
                break
        if expiry and parse_utc_datetime(expiry) < utc_now():
            raise HTTPException(status_code=403, detail="Your access to this file has expired")

    owner_doc = await users_collection.find_one({"email": doc["owner_email"]})
    if not owner_doc:
        raise HTTPException(status_code=404, detail="File owner account was not found")
    encrypted_data, iv = await load_stored_payload(doc, owner_doc)
    owner_key = owner_doc.get("encryption_key")
    original_bytes = decrypt_file(encrypted_data, iv, hex_key=owner_key)

    computed_hash = compute_sha256(original_bytes)
    if computed_hash != doc["sha256_hash"]:
        raise HTTPException(status_code=500, detail="File integrity check FAILED!")

    return Response(
        content=original_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc["original_name"]}"'}
    )


@router.post("/share")
async def share_file(
    payload: ShareFileRequest,
    current_user: dict = Depends(get_current_user)
):
    object_id = parse_file_id(payload.file_id)
    doc = await files_collection.find_one({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    if doc["owner_email"] != current_user["email"]:
        raise HTTPException(status_code=403, detail="Only the owner can share this file")

    if payload.share_with_email == current_user["email"]:
        raise HTTPException(status_code=400, detail="You already have access to your own file")

    target = await users_collection.find_one({"email": payload.share_with_email})
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    expiry = (utc_now() + timedelta(hours=payload.expiry_hours)).isoformat()

    await files_collection.update_one(
        {"_id": object_id},
        {"$pull": {"share_expiry_list": {"email": payload.share_with_email}}}
    )

    await files_collection.update_one(
        {"_id": object_id},
        {
            "$addToSet": {"shared_with": payload.share_with_email},
            "$push": {"share_expiry_list": {
                "email": payload.share_with_email,
                "expiry": expiry
            }}
        }
    )

    msg = f"File shared with {payload.share_with_email}"
    msg += f" (expires in {payload.expiry_hours} hours)"

    return {"message": msg}


@router.patch("/star/{file_id}")
async def star_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    object_id = parse_file_id(file_id)
    doc = await files_collection.find_one({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    if doc["owner_email"] != current_user["email"]:
        raise HTTPException(status_code=403, detail="Access denied")

    new_starred = not doc.get("starred", False)
    await files_collection.update_one(
        {"_id": object_id},
        {"$set": {"starred": new_starred}}
    )
    return {"starred": new_starred}


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    object_id = parse_file_id(file_id)
    doc = await files_collection.find_one({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    if doc["owner_email"] != current_user["email"]:
        raise HTTPException(status_code=403, detail="Only the owner can delete this file")

    await files_collection.update_one(
        {"_id": object_id},
        {"$set": {"trashed": True}}
    )
    return {"message": "File moved to trash"}


@router.delete("/trash/permanent/{file_id}")
async def permanent_delete(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    object_id = parse_file_id(file_id)
    doc = await files_collection.find_one({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    if doc["owner_email"] != current_user["email"]:
        raise HTTPException(status_code=403, detail="Only the owner can delete this file")

    if doc.get("storage_provider") == "google_drive" and doc.get("drive_file_id"):
        owner_doc = await users_collection.find_one({"email": doc["owner_email"]})
        if not owner_doc:
            raise HTTPException(status_code=404, detail="File owner account was not found")
        access_token = await get_drive_access_token(owner_doc)
        try:
            await run_in_threadpool(delete_drive_file, access_token, doc["drive_file_id"])
        except requests.HTTPError as exc:
            if exc.response is None or exc.response.status_code != 404:
                detail = exc.response.text if exc.response is not None and exc.response.text else "Could not delete file from Google Drive"
                raise HTTPException(status_code=502, detail=detail)
    else:
        import os

        storage_path = doc.get("storage_path")
        if storage_path and os.path.exists(storage_path):
            os.remove(storage_path)

    await files_collection.delete_one({"_id": object_id})
    return {"message": "File permanently deleted"}


@router.patch("/trash/restore/{file_id}")
async def restore_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    object_id = parse_file_id(file_id)
    doc = await files_collection.find_one({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    if doc["owner_email"] != current_user["email"]:
        raise HTTPException(status_code=403, detail="Only the owner can restore this file")

    await files_collection.update_one(
        {"_id": object_id},
        {"$set": {"trashed": False}}
    )
    return {"message": "File restored successfully"}


@router.patch("/shared/remove/{file_id}")
async def remove_shared_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    object_id = parse_file_id(file_id)
    doc = await files_collection.find_one({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    email = current_user["email"]

    if doc["owner_email"] == email:
        raise HTTPException(status_code=403, detail="Owner cannot use this endpoint")

    if email not in doc.get("shared_with", []):
        raise HTTPException(status_code=403, detail="File not shared with you")

    await files_collection.update_one(
        {"_id": object_id},
        {
            "$pull": {
                "shared_with": email,
                "share_expiry_list": {"email": email}
            }
        }
    )
    return {"message": "File removed from your shared list"}
