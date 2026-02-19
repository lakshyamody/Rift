from fastapi.testclient import TestClient
from backend.main import app
import os

client = TestClient(app)

def test_backend_with_complex_csv():
    # Path to sample CSV
    csv_path = "data/test_complex_scenarios.csv"
    
    if not os.path.exists(csv_path):
        print(f"Error: Sample file not found at {csv_path}")
        return

    print(f"Testing backend with file: {csv_path}")
    
    with open(csv_path, "rb") as f:
        response = client.post("/detect", files={"file": ("test_complex_scenarios.csv", f, "text/csv")})
        
    if response.status_code == 200:
        print("\n✅ Backend is working correctly!")
        data = response.json()
        
        # Summary
        summary = data.get("summary", {})
        print("\n--- Summary ---")
        print(f"Total Accounts Analyzed: {summary.get('total_accounts_analyzed')}")
        print(f"Suspicious Accounts Flagged: {summary.get('suspicious_accounts_flagged')}")
        print(f"Fraud Rings Detected: {summary.get('fraud_rings_detected')}")
        print(f"Processing Time: {summary.get('processing_time_seconds')} seconds")
        
        # Fraud Rings
        rings = data.get("fraud_rings", [])
        if rings:
            print(f"\n--- Detected Rings ({len(rings)}) ---")
            for ring in rings: # Show ALL rings
                print(f"Ring ID: {ring['ring_id']}, Type: {ring['pattern_type']}, Risk: {ring['risk_score']}")
                # print(f"Members: {ring['member_accounts']}")
        
        # Suspicious Accounts
        suspicious = data.get("suspicious_accounts", [])
        if suspicious:
            print(f"\n--- Top Suspicious Accounts (Top 10) ---")
            for acc in suspicious[:10]: # Show top 10 suspicious
                print(f"Account: {acc['account_id']}, Score: {acc['suspicion_score']:.2f}, Patterns: {sorted(acc['detected_patterns'])}")
                
    else:
        print(f"\n❌ Backend failed with status code: {response.status_code}")
        print(f"Detail: {response.text}")

if __name__ == "__main__":
    test_backend_with_complex_csv()
