from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Money Muling Detection Engine is running in modular mode"}

@app.post("/detect", response_model=DetectionResponse)
async def detect_money_muling(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        # Just warn, but maybe allow if user forgot extension
        pass
    
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        # Validation
        required_columns = {'sender_id', 'receiver_id', 'amount', 'timestamp'}
        if not required_columns.issubset(df.columns):
            raise HTTPException(
                status_code=400, 
                detail=f"CSV must contain columns: {required_columns}. Found: {df.columns.tolist()}"
            )
            
        # Analysis
        result = analyze_transactions(df)
        
        return DetectionResponse(**result)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
