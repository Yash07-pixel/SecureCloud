import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Request
from fastapi.responses import Response
from bson import ObjectId
from bson.errors import InvalidId
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.security import get_current_user
from app.core.database import files_collection, users_collection
from app.schemas.schemas import ShareFileRequest
from app.utils.validation import validate_file
from app.utils.encryption import (
    encrypt_file, decrypt_file,
    compute_sha256,
    save_encrypted_file, load_encrypted_file,
)

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/files", tags=["Files"])


def parse_file_id(file_id: str) -> ObjectId:
    try:
        return ObjectId(file_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid file ID")


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
    user_key = user_doc.get("encryption_key")
    encrypted_data, iv = encrypt_file(raw_bytes, hex_key=user_key)
    stored_filename = f"{uuid.uuid4().hex}_{file.filename}"
    filepath = save_encrypted_file(stored_filename, encrypted_data, iv)

    doc = {
        "filename": stored_filename,
        "original_name": file.filename,
        "owner_email": current_user["email"],
        "size": len(raw_bytes),
        "sha256_hash": sha256,
        "storage_path": filepath,
        "shared_with": [],
        "share_expiry_list": [],
        "trashed": False,
        "starred": False,
        "uploaded_at": datetime.utcnow(),
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
            "shared_with": doc.get("shared_with", []),
            "starred": doc.get("starred", False),
            "uploaded_at": doc["uploaded_at"],
            "is_owner": True,
        })
    return files


@router.get("/shared")
async def shared_with_me(current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    now = datetime.utcnow()
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

        if expiry and datetime.fromisoformat(expiry) < now:
            continue

        hours_remaining = None
        if expiry:
            diff = datetime.fromisoformat(expiry) - datetime.utcnow()
            hours_remaining = max(0, int(diff.total_seconds() / 3600))

        files.append({
            "id": str(doc["_id"]),
            "original_name": doc["original_name"],
            "owner_email": doc["owner_email"],
            "size": doc["size"],
            "sha256_hash": doc["sha256_hash"],
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
        if expiry and datetime.fromisoformat(expiry) < datetime.utcnow():
            raise HTTPException(status_code=403, detail="Your access to this file has expired")

    encrypted_data, iv = load_encrypted_file(doc["storage_path"])
    owner_doc = await users_collection.find_one({"email": doc["owner_email"]})
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

    expiry = (datetime.utcnow() + timedelta(hours=payload.expiry_hours)).isoformat()

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
    import os
    object_id = parse_file_id(file_id)
    doc = await files_collection.find_one({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    if doc["owner_email"] != current_user["email"]:
        raise HTTPException(status_code=403, detail="Only the owner can delete this file")

    if os.path.exists(doc["storage_path"]):
        os.remove(doc["storage_path"])

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
