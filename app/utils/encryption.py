import os
import hashlib
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from app.core.config import settings

def get_aes_key() -> bytes:
    key = settings.AES_SECRET_KEY.encode("utf-8")
    return key[:32].ljust(32, b"0")

def encrypt_file(data: bytes):
    key = get_aes_key()
    iv = os.urandom(16)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    encrypted = cipher.encrypt(pad(data, AES.block_size))
    return encrypted, iv

def decrypt_file(encrypted_data: bytes, iv: bytes) -> bytes:
    key = get_aes_key()
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