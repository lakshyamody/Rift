import time
import pandas as pd
from typing import Dict, Any

from .core.graph import build_graph
from .detectors.circular_fund_routing import detect_cycles
from .detectors.smurfing_patterns import detect_smurfing
from .detectors.layered_shell_networks import detect_shells
from .ml.isolation_forest_anomaly import calculate_ml_suspicion_scores

def analyze_transactions(df: pd.DataFrame) -> Dict[str, Any]:
    start_time = time.time()
    
    # Preprocessing
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Graph Construction
    G = build_graph(df)
    
    # 1. Cycle Detection
    cycles = detect_cycles(G, df)
    
    # 2. Smurfing Detection
    smurfing = detect_smurfing(df)
    
    # 3. Shell Detection
    shells = detect_shells(G, df)
    
    # 3. Supervised ML Fraud Detection (XGBoost + Node2Vec)
    # Using the new SOTA model instead of Isolation Forest
    from .ml.supervised_model import SupervisedFraudModel
    
    # Initialize and Predict
    xgb_model = SupervisedFraudModel()
    ml_scores = xgb_model.predict(df)
    
    # 4. Receiver-Side Detection (NEW)
    from .core.profiling import PersonalAmountProfile, compute_s1_score, rapid_inflow_exit_detector
    from .detectors.mule_collectors import detect_mule_collectors

    # 4a. Build Profiles & Run Segment-of-One
    profiles = {}
    txn_scores = []
    
    # Pre-build profiles for relevant accounts
    # Optimization: Only build for active receivers? 
    # For now, build for all unique accounts in this batch
    unique_accounts = set(df.sender_id) | set(df.receiver_id)
    for acc in unique_accounts:
        profiles[acc] = PersonalAmountProfile(acc).fit(df)
        
    # Score Inbound Transactions
    for _, txn in df.iterrows():
        rid = txn['receiver_id']
        if rid in profiles:
             signals = profiles[rid].score_new_transaction(txn, role='receiver')
             s1 = compute_s1_score(signals)
             if s1 > 50: # Only track significant risk
                 txn_scores.append({
                     'receiver_id': rid,
                     's1_score': s1
                 })
                 
    # Aggregate S1 scores per receiver
    receiver_s1_map = {}
    if txn_scores:
        s1_df = pd.DataFrame(txn_scores)
        receiver_s1_map = s1_df.groupby('receiver_id')['s1_score'].max().to_dict()
        
    # 4b. Mule Collector
    mule_collectors = detect_mule_collectors(df)
    mule_map = {m['receiver_id']: m for m in mule_collectors}
    
    # 4c. Rapid Exit
    rapid_exit_alerts = []
    # Only run for high S1 or high Mule Score accounts
    high_risk_candidates = set(receiver_s1_map.keys()) | set(mule_map.keys())
    for acc in high_risk_candidates:
        alerts = rapid_inflow_exit_detector(acc, df)
        rapid_exit_alerts.extend(alerts)
        
    rapid_exit_map = {a['account_id']: a for a in rapid_exit_alerts}

    # Aggregate Results
    suspicious_accounts = []
    fraud_rings = []
    
    # Helper to track account -> ring_id
    account_ring_map = {}
    
    # 1. Process Cycles
    for i, cycle in enumerate(cycles):
        ring_id = f"RING_CYCLE_{i+1:03d}"
        for member in cycle:
            account_ring_map[member] = ring_id
        fraud_rings.append({
            "ring_id": ring_id,
            "member_accounts": cycle,
            "pattern_type": "cycle",
            "risk_score": min(90.0 + (len(cycle) * 2), 100.0)
        })
        
    # 2. Process Smurfing
    for i, pattern in enumerate(smurfing):
        ring_id = f"RING_SMURF_{i+1:03d}"
        members = [pattern['center']] + pattern['members']
        for member in members:
            # Overwrite if exists? Or allow multiple? Simple map for now.
            if member not in account_ring_map:
                account_ring_map[member] = ring_id
        fraud_rings.append({
            "ring_id": ring_id,
            "member_accounts": members,
            "pattern_type": pattern['type'],
            "risk_score": 95.0 if pattern['type'] == 'fan_in_out' else 85.0
        })

    # 3. Process Shells
    for i, chain in enumerate(shells):
        # Deduplication: Check if this shell overlaps significantly with existing rings (e.g. Cycles)
        overlap_count = 0
        for member in chain:
            if member in account_ring_map:
                overlap_count += 1
        
        # If more than 50% of the shell is already in a ring, skip it (likely a Cycle detected as line)
        if overlap_count > len(chain) * 0.5:
            continue

        ring_id = f"RING_SHELL_{i+1:03d}"
        for member in chain:
            if member not in account_ring_map:
                account_ring_map[member] = ring_id
        fraud_rings.append({
            "ring_id": ring_id,
            "member_accounts": chain,
            "pattern_type": "layered_shell",
            "risk_score": 80.0
        })

    # Compile Suspicious Accounts
    all_accounts = set(df['sender_id']).union(set(df['receiver_id']))
    
    for account in all_accounts:
        patterns = []
        ring_id = account_ring_map.get(account)
        
        # Check membership in rings
        for ring in fraud_rings:
            if account in ring['member_accounts']:
                if ring['pattern_type'] == 'cycle':
                     patterns.append(f"cycle_member")
                elif 'fan_' in ring['pattern_type']:
                    if account == ring['member_accounts'][0]: 
                        patterns.append(f"{ring['pattern_type']}_center")
                    else:
                        patterns.append(f"{ring['pattern_type']}_member")
                elif ring['pattern_type'] == 'layered_shell':
                    patterns.append("shell_member")
        
        # 1. Sender Side Score (XGBoost Prob)
        sender_score = ml_scores.get(account, 0)
        
        # 2. Receiver Side Score (S1 + Mule)
        s1_val = receiver_s1_map.get(account, 0)
        mule_val = mule_map.get(account, {}).get('mule_collector_score', 0)
        rapid_val = 95.0 if account in rapid_exit_map else 0
        
        # Weighted Receiver Score
        receiver_score = max(s1_val, mule_val, rapid_val)
        
        if account in mule_map:
             patterns.append(f"mule_collector_risk:{mule_map[account]['risk_label']}")
        if account in rapid_exit_map:
             patterns.append("rapid_exit_detected")
        
        # Fusion Strategy: MAX(Sender, Receiver)
        # If you fail EITHER check, you are flagged.
        base_final = max(sender_score, receiver_score)
        
        final_score = base_final
        
        if patterns:
            # High Priority Patterns Boosting
            if any('center' in p for p in patterns) or \
               any('cycle' in p for p in patterns) or \
               any('shell' in p for p in patterns) or \
               any('rapid_exit' in p for p in patterns) or \
               any('CRITICAL' in p for p in patterns):
                final_score = max(final_score, 90.0)
            elif any('fan_out_member' in p for p in patterns):
                pass 
            else:
                final_score = max(final_score, 75.0) # Members get min 75
        
        # Post-Processing Whitelist for High Volume Merchants/Payroll
        if not patterns and final_score > 60:
            pass

        # Reporting Threshold
        if final_score >= 75:
            # Metadata construction
            meta = {}
            if account in mule_map:
                meta['mule_stats'] = mule_map[account]
            if account in rapid_exit_map:
                meta['rapid_exit_stats'] = rapid_exit_map[account]
                
            suspicious_accounts.append({
                "account_id": account,
                "suspicion_score": float(final_score),
                "detected_patterns": list(set(patterns)), # dedupe
                "ring_id": ring_id,
                "metadata": meta
            })
            
    # Sort by score
    suspicious_accounts.sort(key=lambda x: x['suspicion_score'], reverse=True)
    
    processing_time = time.time() - start_time
    
    return {
        "suspicious_accounts": suspicious_accounts,
        "fraud_rings": fraud_rings,
        "summary": {
            "total_accounts_analyzed": len(all_accounts),
            "suspicious_accounts_flagged": len(suspicious_accounts),
            "fraud_rings_detected": len(fraud_rings),
            "processing_time_seconds": round(processing_time, 4)
        }
    }
