from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import ingestion
from api import github, webhook, rag, scaffold, graph, impact, events, health

app = FastAPI(
    title="SPIT - Intelligent Architecture & Knowledge Platform",
    description="API for the Living Knowledge Graph and Automated Staff Engineer",
    version="2.0.0"
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
app.include_router(github.router)
app.include_router(webhook.router)
app.include_router(rag.router)
app.include_router(scaffold.router)
app.include_router(graph.router)
app.include_router(impact.router)
app.include_router(events.router)
app.include_router(health.router)

@app.get("/")
async def root():
    return {"message": "Welcome to the SPIT API. The Living Knowledge Graph is online."}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "components": {"api": "ok"}}
