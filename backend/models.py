from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from datetime import datetime

class AccountSuspicion(BaseModel):
    account_id: str
    suspicion_score: float
    detected_patterns: List[str]
    ring_id: Optional[str] = None

class FraudRing(BaseModel):
    ring_id: str
    member_accounts: List[str]
    pattern_type: str
    risk_score: float
    reconstruction: Optional[Dict[str, Any]] = None
    narrative: Optional[str] = None

class AnalysisSummary(BaseModel):
    total_accounts_analyzed: int
    suspicious_accounts_flagged: int
    fraud_rings_detected: int
    processing_time_seconds: float

class DetectionResponse(BaseModel):
    suspicious_accounts: List[AccountSuspicion]
    fraud_rings: List[FraudRing]
    summary: AnalysisSummary
    graph_data: Optional[Dict[str, Any]] = None
    cross_ring_patterns: Optional[List[Dict[str, Any]]] = None
    master_report: Optional[str] = None
    chatbot_payload: Optional[Dict[str, Any]] = None
