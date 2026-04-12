import os
import hashlib
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from app.core.config import settings


def generate_user_key() -> str:
    """Generate a random 32-byte AES key as hex string."""
    return os.urandom(32).hex()


def get_aes_key(hex_key: str = None) -> bytes:
    """Convert hex key to bytes. Falls back to global key if none provided."""
    if hex_key:
        return bytes.fromhex(hex_key)
    key = settings.AES_SECRET_KEY.encode("utf-8")
    return key[:32].ljust(32, b"0")


def encrypt_file(data: bytes, hex_key: str = None):
    key = get_aes_key(hex_key)
    iv = os.urandom(16)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    encrypted = cipher.encrypt(pad(data, AES.block_size))
    return encrypted, iv


def decrypt_file(encrypted_data: bytes, iv: bytes, hex_key: str = None) -> bytes:
    key = get_aes_key(hex_key)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    decrypted = unpad(cipher.decrypt(encrypted_data), AES.block_size)
    return decrypted


def compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def save_encrypted_file(filename: str, encrypted_data: bytes, iv: bytes) -> str:
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(iv + encrypted_data)
    return filepath


def load_encrypted_file(filepath: str):
    with open(filepath, "rb") as f:
        raw = f.read()
    iv = raw[:16]
    encrypted_data = raw[16:]
    return encrypted_data, iv


def encrypt_text(value: str, hex_key: str = None) -> str:
    encrypted_data, iv = encrypt_file(value.encode("utf-8"), hex_key=hex_key)
    return base64.b64encode(iv + encrypted_data).decode("utf-8")


def decrypt_text(value: str, hex_key: str = None) -> str:
    raw = base64.b64decode(value.encode("utf-8"))
    iv = raw[:16]
    encrypted_data = raw[16:]
    return decrypt_file(encrypted_data, iv, hex_key=hex_key).decode("utf-8")
