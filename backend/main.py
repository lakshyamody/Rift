from fastapi import FastAPI, UploadFile, File, HTTPException
import os
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .models import DetectionResponse, AccountSuspicion, FraudRing, AnalysisSummary
from .orchestrator import analyze_transactions
import pandas as pd
import io
import networkx as nx
from typing import List

app = FastAPI(title="Money Muling Detection Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache the last analysis result for report download
_last_result_cache = None

def _build_report_payload(result: dict) -> dict:
    """Build the exact spec-compliant JSON payload for download."""
    suspicious = sorted(
        [
            {
                "account_id": acc["account_id"],
                "suspicion_score": round(float(acc["suspicion_score"]), 2),
                "detected_patterns": acc.get("detected_patterns", []),
                "ring_id": acc.get("ring_id") or "NONE"
            }
            for acc in result.get("suspicious_accounts", [])
        ],
        key=lambda x: -x["suspicion_score"]
    )

    rings = [
        {
            "ring_id": ring["ring_id"],
            "member_accounts": ring.get("member_accounts", []),
            "pattern_type": ring.get("pattern_type", "unknown"),
            "risk_score": round(float(ring.get("risk_score", 0)), 2)
        }
        for ring in result.get("fraud_rings", [])
    ]

    summary = {
        "total_accounts_analyzed": result["summary"]["total_accounts_analyzed"],
        "suspicious_accounts_flagged": result["summary"]["suspicious_accounts_flagged"],
        "fraud_rings_detected": result["summary"]["fraud_rings_detected"],
        "processing_time_seconds": result["summary"]["processing_time_seconds"]
    }

    return {
        "suspicious_accounts": suspicious,
        "fraud_rings": rings,
        "summary": summary
    }

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Money Muling Detection Engine is running in modular mode"}

@app.get("/sample", response_model=DetectionResponse)
async def analyze_sample():
    global _last_result_cache
    sample_path = "data/test_complex_scenarios.csv"
    if not os.path.exists(sample_path):
        raise HTTPException(status_code=404, detail="Sample transactions file not found")
    
    try:
        df = pd.read_csv(sample_path)
        result = analyze_transactions(df)
        _last_result_cache = result
        return DetectionResponse(**result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/report.json")
async def download_report():
    """Returns the exact spec-compliant JSON format for submission/download."""
    global _last_result_cache
    if _last_result_cache is None:
        sample_path = "data/test_complex_scenarios.csv"
        if not os.path.exists(sample_path):
            raise HTTPException(status_code=404, detail="No analysis available. Call /sample first.")
        df = pd.read_csv(sample_path)
        _last_result_cache = analyze_transactions(df)

    payload = _build_report_payload(_last_result_cache)
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": "attachment; filename=fraud_report.json"}
    )

@app.post("/detect", response_model=DetectionResponse)
async def detect_money_muling(file: UploadFile = File(...)):
    global _last_result_cache
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        required_columns = {'sender_id', 'receiver_id', 'amount', 'timestamp'}
        if not required_columns.issubset(df.columns):
            raise HTTPException(
                status_code=400,
                detail=f"CSV must contain columns: {required_columns}. Found: {df.columns.tolist()}"
            )
            
        result = analyze_transactions(df)
        _last_result_cache = result
        return DetectionResponse(**result)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
