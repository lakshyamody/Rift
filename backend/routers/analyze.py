"""
FastAPI router for /analyze endpoint.
Accepts CSV file upload, runs detection pipeline, returns JSON with graph data.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from graph.pipeline import run_analysis

router = APIRouter()


@router.post("/analyze")
async def analyze_transactions(file: UploadFile = File(...)):
    """
    Upload a CSV file with transaction data.
    Returns fraud detection results and graph visualization data.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        output = run_analysis(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    return JSONResponse(content=output)


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "NACHT Money Muling Detection Engine"}
