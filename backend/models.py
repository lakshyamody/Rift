from pydantic import BaseModel
from typing import List, Optional
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

class AnalysisSummary(BaseModel):
    total_accounts_analyzed: int
    suspicious_accounts_flagged: int
    fraud_rings_detected: int
    processing_time_seconds: float

class DetectionResponse(BaseModel):
    suspicious_accounts: List[AccountSuspicion]
    fraud_rings: List[FraudRing]
    summary: AnalysisSummary
