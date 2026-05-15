# SecureCloud 🔐

> Encrypted file storage with AES-256, JWT authentication, and SHA-256 integrity verification.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat&logo=mongodb)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is SecureCloud?

SecureCloud is a full-stack secure file storage platform. Every file you upload is encrypted server-side with AES-256-CBC using a **unique per-user encryption key** before it ever touches disk. Files are verified on every download using SHA-256 integrity checks — if a single byte was tampered with, the download is rejected.

Think Google Drive, but with real encryption.

**Live Demo:** [https://secure-cloud-tawny.vercel.app](https://secure-cloud-tawny.vercel.app)  
---

## Features

- **AES-256-CBC Encryption** — every file encrypted with a per-user 256-bit key and a random IV per upload
- **SHA-256 Integrity Verification** — hash computed at upload, re-verified at every download
- **JWT Authentication** — HS256 signed tokens with 60-minute expiry
- **bcrypt Password Hashing** — passwords never stored in plaintext
- **File Sharing with Expiry** — share files with registered users for 24h / 3 days / 7 days / 30 days
- **Soft Delete / Trash** — files go to trash first, permanent delete removes from disk and database
- **Starred Files** — bookmark important files for quick access
- **Shared With Me** — view files others have granted you access to, with countdown timers
- **Rate Limiting** — per-route limits to prevent brute-force and abuse
- **Dark / Light Mode** — persisted across sessions, respects OS preference on first visit
- **Search & Sort** — filter files by name, sort by date, size, or name
- **File Size Validation** — streaming chunk-based validation, 50MB limit

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| FastAPI | Async REST API framework |
| Motor (AsyncIOMotorClient) | Async MongoDB driver |
| PyCryptodome | AES-256-CBC encryption |
| passlib + bcrypt | Password hashing |
| python-jose | JWT creation and verification |
| Pydantic v2 | Request validation and settings |
| slowapi | Rate limiting per IP |
| uvicorn | ASGI server |

### Frontend
| Technology | Purpose |
|---|---|
| React 18 | UI framework |
| React Router v6 | Client-side routing |
| Axios | HTTP client with interceptors |
| Context API | Global theme and feedback state |

### Infrastructure
| Service | Purpose |
|---|---|
| MongoDB Atlas | Database (users + file metadata) |
| Render | Backend hosting |
| Vercel | Frontend hosting (CDN) |

---

## Project Structure

```
SecureCloud/
├── main.py                         # FastAPI app, CORS, rate limiter, router registration
├── requirements.txt                # Python dependencies
│
├── app/
│   ├── core/
│   │   ├── config.py               # Pydantic settings — reads from .env
│   │   ├── database.py             # Motor client, collections, index creation
│   │   └── security.py            # bcrypt hashing, JWT create/decode, get_current_user dependency
│   │
│   ├── routers/
│   │   ├── auth.py                 # POST /auth/register, POST /auth/login
│   │   └── files.py               # All 10 file endpoints
│   │
│   ├── schemas/
│   │   └── schemas.py             # Pydantic models: UserRegister, UserLogin, TokenResponse, FileOut, ShareFileRequest
│   │
│   └── utils/
│       ├── encryption.py          # AES-256-CBC encrypt/decrypt, SHA-256, file save/load
│       └── validation.py          # Streaming file size validation (50MB limit)
│
└── frontend/
    ├── public/
    │   └── index.html
    │
    └── src/
        ├── App.js                  # Router, ThemeProvider, FeedbackProvider
        ├── index.js                # React root
        │
        ├── pages/
        │   ├── Login.js            # Email + password login form
        │   ├── Register.js         # Registration with client-side validation
        │   ├── Dashboard.js        # My Files — upload, download, share, star, delete
        │   ├── SharedWithMe.js     # Files shared with current user + expiry countdown
        │   ├── Starred.js          # Starred files
        │   └── Trash.js            # Soft-deleted files — restore or permanent delete
        │
        ├── services/
        │   └── api.js              # Axios instance, request/response interceptors, all API functions
        │
        ├── context/
        │   ├── FeedbackContext.js  # Toast notifications + promise-based confirm dialogs
        │   └── ThemeContext.js     # Dark/light toggle, persisted in localStorage
        │
        └── components/
            └── ThemeToggle.js      # Moon/sun toggle button
```

---

## How Encryption Works

```
UPLOAD FLOW
──────────────────────────────────────────────────────────
1. File received as multipart/form-data
2. Read in 1MB chunks → validate size ≤ 50MB
3. Compute SHA-256 hash on raw plaintext bytes
4. Fetch user's unique AES key from MongoDB
5. Generate 16 random bytes as IV (os.urandom(16))
6. Encrypt: AES.new(key, CBC, iv) → pad → encrypt
7. Save to disk as: [IV (16 bytes)] + [ciphertext]
8. Store metadata in MongoDB: filename, hash, size, owner, etc.

DOWNLOAD FLOW
──────────────────────────────────────────────────────────
1. Verify JWT token → get current user
2. Check file ownership or shared access
3. If shared: verify expiry has not passed
4. Read file from disk → split first 16 bytes as IV
5. Fetch owner's AES key from MongoDB
6. Decrypt: AES.new(key, CBC, iv) → decrypt → unpad
7. Recompute SHA-256 on decrypted bytes
8. Compare with stored hash → mismatch = HTTP 500
9. Stream original bytes to client
```

---

## API Reference

### Authentication

| Method | Endpoint | Rate Limit | Description |
|---|---|---|---|
| POST | `/auth/register` | 3/min | Register new user, generate AES key |
| POST | `/auth/login` | 5/min | Verify credentials, return JWT |

### Files (all require `Authorization: Bearer <token>`)

| Method | Endpoint | Rate Limit | Description |
|---|---|---|---|
| POST | `/files/upload` | 10/min | Upload, encrypt, and store a file |
| GET | `/files/` | 60/min | List all non-trashed files owned by user |
| GET | `/files/shared` | 60/min | Files shared with the current user |
| GET | `/files/starred` | 60/min | Starred files owned by user |
| GET | `/files/trash` | 60/min | Trashed files owned by user |
| GET | `/files/download/{file_id}` | 60/min | Decrypt and download a file |
| POST | `/files/share` | 60/min | Share a file with a registered user |
| PATCH | `/files/star/{file_id}` | 60/min | Toggle starred status |
| DELETE | `/files/{file_id}` | 60/min | Soft delete (move to trash) |
| DELETE | `/files/trash/permanent/{file_id}` | 60/min | Permanently delete from disk and DB |
| PATCH | `/files/trash/restore/{file_id}` | 60/min | Restore from trash |
| PATCH | `/files/shared/remove/{file_id}` | 60/min | Remove yourself from a shared file |

---

## MongoDB Schema

### `users` collection
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "$2b$12$...",
  "is_verified": true,
  "encryption_key": "64-character-hex-string"
}
```

### `files` collection
```json
{
  "filename": "uuid4_originalname.pdf",
  "original_name": "originalname.pdf",
  "owner_email": "john@example.com",
  "size": 204800,
  "sha256_hash": "abc123...",
  "storage_path": "encrypted_files/uuid4_originalname.pdf",
  "shared_with": ["friend@example.com"],
  "share_expiry_list": [
    { "email": "friend@example.com", "expiry": "2024-12-01T12:00:00" }
  ],
  "trashed": false,
  "starred": false,
  "uploaded_at": "2024-11-24T10:00:00Z"
}
```

---

## Local Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)

### Backend

```bash
# Clone the repository
git clone https://github.com/Yash07-pixel/SecureCloud.git
cd SecureCloud

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Fill in your values (see Environment Variables section)

# Run the server
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`  
Interactive docs at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

The app will open at `http://localhost:3000`

---

## Environment Variables

Create a `.env` file in the root directory:

```env
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/
DB_NAME=securecloud
SECRET_KEY=your-super-secret-jwt-key-minimum-32-characters
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
AES_SECRET_KEY=your-32-character-aes-fallback-key
UPLOAD_DIR=encrypted_files
MAX_FILE_SIZE_MB=50
```

> **Never commit your `.env` file.** It is already in `.gitignore`.

---

## Security Design Decisions

### Per-user encryption keys
Every user gets a unique 256-bit key generated at registration using `os.urandom(32)`. A single compromised key only exposes that user's files — not the entire database.

### IV per file
A fresh 16-byte IV is generated for every upload using `os.urandom(16)`. Encrypting the same file twice produces different ciphertext, preventing pattern analysis.

### SHA-256 integrity on every download
The hash is computed on the **plaintext** before encryption and recomputed after decryption on every download. This catches disk corruption and any tampering with the ciphertext.

### Rate limiting
Separate limits per sensitive route prevent brute-force on login (5/min), mass account creation (3/min), and storage abuse (10/min uploads).

### Known limitations (production improvements)
| Current | Production Answer |
|---|---|
| AES-256-CBC | AES-256-GCM (authenticated encryption, no padding oracle risk) |
| Keys stored in MongoDB | AWS KMS with envelope encryption |
| Files on local disk | AWS S3 with presigned URLs |
| Token in localStorage | HttpOnly cookie (XSS-safe) |
| Hand-rolled JWT | AWS Cognito or Auth0 |
| Render ephemeral disk | Persistent object storage |

---

## Author

**Yash** — [GitHub](https://github.com/Yash07-pixel)

---
