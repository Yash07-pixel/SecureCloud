from fastapi import HTTPException, UploadFile
import os

MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", 50))
MAX_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
CHUNK_SIZE = 1024 * 1024


async def validate_file(file: UploadFile) -> bytes:
    chunks = []
    total_size = 0

    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break

        total_size += len(chunk)
        if total_size > MAX_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB."
            )

        chunks.append(chunk)

    contents = b"".join(chunks)

    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="File is empty.")

    return contents
