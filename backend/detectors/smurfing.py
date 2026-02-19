import pandas as pd
from typing import List, Dict, Any

def detect_smurfing(df: pd.DataFrame, time_window_hours: int = 72) -> List[Dict[str, Any]]:
    """Detects fan-in and fan-out patterns within a time window, filtering legitimate entities."""
    patterns = []
    
    # Calculate stats for filtering
    account_stats = df.groupby('sender_id')['amount'].agg(['sum', 'count']).rename(columns={'sum': 'sent_sum', 'count': 'sent_count'})
    recv_stats = df.groupby('receiver_id')['amount'].agg(['sum', 'count']).rename(columns={'sum': 'recv_sum', 'count': 'recv_count'})
    stats = pd.concat([account_stats, recv_stats], axis=1).fillna(0)
    
    # 1. Detect Fan-In (Many -> 1)
    # Filter: Must not be a Merchant (High In, Low Out)
    fan_in = df.groupby('receiver_id').filter(lambda x: len(x) >= 10)
    for receiver, group in fan_in.groupby('receiver_id'):
        min_time = group['timestamp'].min()
        max_time = group['timestamp'].max()
        if (max_time - min_time).total_seconds() <= time_window_hours * 3600:
            
            # Merchant Check: ratio of Sent/Received
            s_out = stats.loc[receiver, 'sent_sum']
            s_in = stats.loc[receiver, 'recv_sum']
            ratio = s_out / s_in if s_in > 0 else 0
            
            # If ratio is very low, it's a sink (Merchant), unless it's just accumulating for a big burst later?
            # But specific Hackathon trap says "Merchant". Merchants generally don't send money out to individuals.
            # Mules pass it on.
            if ratio < 0.1: 
                continue # Likely Merchant
                
            patterns.append({
                'type': 'fan_in',
                'center': receiver,
                'members': group['sender_id'].unique().tolist(),
                'count': len(group)
            })

    # 2. Detect Fan-Out (1 -> Many)
    # Filter: Must not be Payroll (High Out, Low In)
    fan_out = df.groupby('sender_id').filter(lambda x: len(x) >= 10)
    for sender, group in fan_out.groupby('sender_id'):
        min_time = group['timestamp'].min()
        max_time = group['timestamp'].max()
        if (max_time - min_time).total_seconds() <= time_window_hours * 3600:
            
            # Payroll Check: Source of funds?
            # Payroll accounts usually have huge Out but 0 In (from this graph's perspective, or loaded via internal transfer)
            # Mules usually have In ~= Out.
            s_out = stats.loc[sender, 'sent_sum']
            s_in = stats.loc[sender, 'recv_sum']
            
            # Filter Logic for Source Fan-Out (s_in == 0)
            if s_in == 0:
                # Risk: Payroll vs Mule Distributor
                # 1. Time Variance Check
                timestamps = group['timestamp']
                duration = (timestamps.max() - timestamps.min()).total_seconds()
                
                # 2. Amount Variance Check
                amounts = group['amount']
                if len(amounts) > 1:
                    cv = amounts.std() / amounts.mean() if amounts.mean() > 0 else 0
                else:
                    cv = 0
                
                # Decision:
                # Payroll: "Batch" (Duration ~ 0) AND Variable Amounts (CV > 0.01)
                # Mule: "Manual" (Duration > 60s) OR Structured/Round (CV ~ 0)
                
                if duration < 60 and cv > 0.01:
                    # Likely Payroll
                    continue
                
                # Otherwise, keep it (Mule Distributor or Layering Start)
            
            patterns.append({
                'type': 'fan_out',
                'center': sender,
                'members': group['receiver_id'].unique().tolist(),
                'count': len(group)
            })
            
    # Deduplicate: Merge Fan-In and Fan-Out if center is same (The "Smurf" aggregator)
    # Actually, keep them separate pattern types for clarity, but the Ring construction will handle grouping if needed.
    # But user asked to "combine smurfing pattern".
    # Let's look for accounts that are BOTH centers.
    
    unique_centers = set(p['center'] for p in patterns)
    merged_patterns = []
    processed_centers = set()
    
    center_map = {p['center']: [] for p in patterns}
    for p in patterns:
        center_map[p['center']].append(p)
        
    for center, p_list in center_map.items():
        if len(p_list) > 1:
            # Both Fan-In and Fan-Out
            members = set()
            types = []
            for p in p_list:
                members.update(p['members'])
                types.append(p['type'])
            merged_patterns.append({
                'type': 'fan_in_out',
                'center': center,
                'members': list(members),
                'count': len(members)
            })
        elif len(p_list) == 1:
            merged_patterns.append(p_list[0])
            
    return merged_patterns
