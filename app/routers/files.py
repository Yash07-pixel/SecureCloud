import uuid
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import Response
from bson import ObjectId
from app.core.security import get_current_user
from app.core.database import files_collection, users_collection
from app.schemas.schemas import ShareFileRequest
from app.utils.encryption import (
    encrypt_file, decrypt_file,
    compute_sha256,
    save_encrypted_file, load_encrypted_file,
)

router = APIRouter(prefix="/files", tags=["Files"])

@router.post("/upload", status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    raw_bytes = await file.read()
    sha256 = compute_sha256(raw_bytes)
    encrypted_data, iv = encrypt_file(raw_bytes)
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
        "$or": [{"owner_email": email}, {"shared_with": email}]
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
            "uploaded_at": doc["uploaded_at"],
        })
    return files

@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    doc = await files_collection.find_one({"_id": ObjectId(file_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    email = current_user["email"]
    if doc["owner_email"] != email and email not in doc.get("shared_with", []):
        raise HTTPException(status_code=403, detail="Access denied")

    encrypted_data, iv = load_encrypted_file(doc["storage_path"])
    original_bytes = decrypt_file(encrypted_data, iv)

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
    doc = await files_collection.find_one({"_id": ObjectId(payload.file_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    if doc["owner_email"] != current_user["email"]:
        raise HTTPException(status_code=403, detail="Only the owner can share this file")

    target = await users_collection.find_one({"email": payload.share_with_email})
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    await files_collection.update_one(
        {"_id": ObjectId(payload.file_id)},
        {"$addToSet": {"shared_with": payload.share_with_email}}
    )
    return {"message": f"File shared with {payload.share_with_email}"}

@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    import os
    doc = await files_collection.find_one({"_id": ObjectId(file_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    if doc["owner_email"] != current_user["email"]:
        raise HTTPException(status_code=403, detail="Only the owner can delete this file")

    if os.path.exists(doc["storage_path"]):
        os.remove(doc["storage_path"])

    await files_collection.delete_one({"_id": ObjectId(file_id)})
    return {"message": "File deleted successfully"}