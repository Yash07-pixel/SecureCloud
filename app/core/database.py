from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.DB_NAME]

# Collections
users_collection = db["users"]
files_collection = db["files"]
token_sessions_collection = db["token_sessions"]


async def ensure_indexes():
    await users_collection.create_index("email", unique=True)
    await token_sessions_collection.create_index("jti", unique=True)
    await token_sessions_collection.create_index("user_email")
    await token_sessions_collection.create_index("expires_at", expireAfterSeconds=0)
