from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import ingestion, webhook, graph

app = FastAPI(
    title="SPIT - Intelligent Architecture & Knowledge Platform",
    description="API for the Living Knowledge Graph and Automated Staff Engineer",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingestion.router)
app.include_router(webhook.router)
app.include_router(graph.router)

@app.get("/")
async def root():
    return {"message": "Welcome to the SPIT API. The Living Knowledge Graph is online."}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "components": {"api": "ok"}}
