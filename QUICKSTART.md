# Quick Start Guide

## Infrastructure Setup (Docker)

To run the required databases (Neo4j, Qdrant, Postgres, Redis):
```bash
docker-compose up -d
```

## Backend Setup

1. **Start the backend server:**
   ```bash
   cd backend
   uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Test the database:**
   ```bash
   cd backend
   python test_commits.py
   ```

3. **Test the API:**
   ```bash
   cd backend
   python test_api.py
   ```

## Frontend Setup

1. **Start the frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

2. **Access the app:**
   - Open http://localhost:3000
   - Navigate to the "Commits" tab
   - Click "Webhooks" button to manage GitHub webhooks

## Database

- Using SQLite: `backend/cortex_commits.db`
- Automatically created on first run
- No PostgreSQL needed

## Features Added

✅ Webhook management UI in Commits tab
✅ Check webhook status for any repository  
✅ Create webhooks from the UI
✅ View webhook details (events, endpoint, status)
✅ SQLite database configuration (no PostgreSQL dependency)
✅ Better error handling in commit service
✅ Console logging for debugging frontend API calls
