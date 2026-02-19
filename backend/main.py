"""
RIFT 2026 — Financial Crime Detection Engine
FastAPI main application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.analyze import router as analyze_router

app = FastAPI(
    title="RIFT Money Muling Detection Engine",
    description="Graph-based financial crime detection using cycle detection, smurfing analysis, and shell network identification.",
    version="1.0.0",
)

# CORS — allow frontend (any origin for hackathon/deployment)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router, prefix="/api")


@app.get("/")
async def root():
    return {
        "message": "RIFT 2026 Money Muling Detection Engine",
        "docs": "/docs",
        "health": "/api/health",
        "analyze": "POST /api/analyze",
    }
