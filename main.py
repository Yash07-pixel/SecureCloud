from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.routers import auth, drive, files
from app.core.database import ensure_indexes
from app.core.rate_limit import limiter

app = FastAPI(
    title="SecureCloud API",
    description="Secure file storage with AES-256 encryption, JWT auth, and SHA-256 integrity verification",
    version="1.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://secure-cloud-tawny.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(drive.router)
app.include_router(files.router)


@app.on_event("startup")
async def startup_event():
    await ensure_indexes()

@app.get("/")
async def root():
    return {
        "app": "SecureCloud",
        "version": "1.0.0",
        "status": "running"
    }
