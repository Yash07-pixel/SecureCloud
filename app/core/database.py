from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.DB_NAME]

# Collections
users_collection = db["users"]
files_collection = db["files"]


async def ensure_indexes():
    await users_collection.create_index("email", unique=True)
