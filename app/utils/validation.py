from fastapi import HTTPException, UploadFile
import os

MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", 50))
MAX_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


async def validate_file(file: UploadFile) -> bytes:
    contents = await file.read()

    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="File is empty.")

    if len(contents) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB."
        )

    return contents