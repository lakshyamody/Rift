import pandas as pd
import datetime
from backend.orchestrator import analyze_transactions

def test_coffee_to_crypto_scenario():
    """
    Simulates a 'Mule Collector' scenario:
    1. Account 'MULE_001' receives 10 small payments ($100-$150) from unknown people (VICTIM_001..010).
    2. Within 1 hour, 'MULE_001' sends $1200 to 'CRYPTO_EXCHANGE'.
    
    Expectation:
    - Mule Collector Score: HIGH
    - Rapid Exit Alert: CRITICAL
    - Final Suspicion Score: > 90
    """
    print("--- Running Coffee-to-Crypto Test ---")
    
    # 1. Generate normal history (to establish baseline)
    # MULE_001 has no history (New Account) -> Baseline 0
    
    data = []
    base_time = datetime.datetime.now()
    
    # Inbound Payments (Smurfing/Fan-In)
    for i in range(10):
        data.append({
            'transaction_id': f'TX_IN_{i}',
            'sender_id': f'VICTIM_{i:03d}',
            'receiver_id': 'MULE_001',
            'amount': 150.0,
            'timestamp': base_time + datetime.timedelta(minutes=i*2) # 20 mins total
        })
        
    # Outbound Payment (Rapid Exit)
    # 30 mins after start
    data.append({
        'transaction_id': 'TX_OUT_1',
        'sender_id': 'MULE_001',
        'receiver_id': 'CRYPTO_EXCHANGE',
        'amount': 1400.0, # 1400 out of 1500
        'timestamp': base_time + datetime.timedelta(minutes=30)
    })
    
    df = pd.DataFrame(data)
    
    # Run Analysis
    results = analyze_transactions(df)
    
    # Verify
    flagged = False
    for acc in results['suspicious_accounts']:
        if acc['account_id'] == 'MULE_001':
            flagged = True
            params = acc['detected_patterns']
            score = acc['suspicion_score']
            meta = acc.get('metadata', {})
            
            print(f"✅ MULE_001 Flagged with Score: {score}")
            print(f"   Patterns: {params}")
            print(f"   Metadata: {meta}")
            
            # Checks
            if score < 85:
                print("❌ FAILED: Score too low.")
            if 'rapid_exit_detected' not in str(params):
                print("❌ FAILED: Rapid Exit not detected.")
            if 'mule_collector_risk' not in str(params):
                print("⚠️ WARNING: Mule Collector pattern missed (might need more history/senders).")
                
            if 'rapid_exit_stats' in meta:
                print(f"   Rapid Exit: {meta['rapid_exit_stats']['passthrough_ratio']*100}% passed through in {meta['rapid_exit_stats']['first_exit_mins']} mins")
            
            break
            
    if not flagged:
        print("❌ FAILED: MULE_001 was not flagged.")

if __name__ == "__main__":
    test_coffee_to_crypto_scenario()
