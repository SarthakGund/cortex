import os
import sys

# Add the backend directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import engine, Base

def truncate_database():
    print("Dropping all tables in cortex_commits.db...")
    Base.metadata.drop_all(bind=engine)
    print("Recreating all tables...")
    Base.metadata.create_all(bind=engine)
    print("Database truncated successfully!")

if __name__ == "__main__":
    truncate_database()
