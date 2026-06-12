import os
from sqlalchemy import create_engine  # FIXED: Changed create_backend_engine to create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Migrate to enterprise PostgreSQL connection pool
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./infinity_db.sqlite")
# Initializing the SQLAlchemy Engine framework layer
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, echo=True)  # FIXED: Changed here as well

# Instantiating session local factories for thread isolation control paths
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# The base class that our database model classes will inherit from
Base = declarative_base()

# Dependency provider wrapper to open/close database sessions automatically per API request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()