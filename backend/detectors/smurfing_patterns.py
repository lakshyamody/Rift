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
            
            # Refined Merchant Check
            # 1. Flow Ratio < 0.1 (Mostly just receiving)
            # 2. Or High Unique Senders (Merchants have many customers)
            unique_senders = group['sender_id'].nunique()
            
            is_merchant = False
            # Fix: Only classify as Merchant if volume is high enough to be a business (>20 txs)
            # Small sinks (10-20 txs) are likely smurfing aggregators.
            if len(group) > 20: 
                if ratio < 0.05:
                    is_merchant = True
                elif unique_senders > 20 and ratio < 0.2:
                    is_merchant = True
            
            if is_merchant: 
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
            s_out = stats.loc[sender, 'sent_sum']
            s_in = stats.loc[sender, 'recv_sum']
            
            # CV (Coefficient of Variation) of amounts
            amounts = group['amount']
            if len(amounts) > 1:
                cv = amounts.std() / amounts.mean() if amounts.mean() > 0 else 0
            else:
                cv = 0

            # Refined Payroll Check
            # 1. Pure Source (s_in == 0 or very low ratio)
            # 2. And (Low CV OR Long Duration)
            # Payroll is often consistent amounts (low CV) OR happens over a day (Long Duration)
            # Mules are often "Empty the account ASAP" (Short duration) AND "Split into varied/random amounts" (High CV)
            
            duration = (max_time - min_time).total_seconds()
            
            # Logic: If it's a pure source...
            if s_in < (s_out * 0.05):
                # If it's very fast, it's suspicious (Smurfing Source / Dispersion)
                # But if it's slow (all day), it's likely business/payroll
                if duration > 3600: # Takes more than an hour to send 10 txs -> Regular business
                    continue
                
                # If fast, check amounts
                # If amounts are super identical (CV ~ 0), it could be automated programmatic payouts (Legit) 
                # or structuring (Fraud). 
                # But usually "Fan-Out" fraud varies amounts to look organic.
                if cv < 0.01:
                    continue # Likely systematic payment
            
            patterns.append({
                'type': 'fan_out',
                'center': sender,
                'members': group['receiver_id'].unique().tolist(),
                'count': len(group)
            })
            
    # Deduplicate: Merge Fan-In and Fan-Out if center is same (The "Smurf" aggregator)
    unique_centers = set(p['center'] for p in patterns)
    merged_patterns = []
    
    center_map = {p['center']: [] for p in patterns}
    for p in patterns:
        center_map[p['center']].append(p)
        
    for center, p_list in center_map.items():
        if len(p_list) > 1:
            # Both Fan-In and Fan-Out
            members = set()
            for p in p_list:
                members.update(p['members'])
            merged_patterns.append({
                'type': 'fan_in_out',
                'center': center,
                'members': list(members),
                'count': len(members)
            })
        elif len(p_list) == 1:
            merged_patterns.append(p_list[0])
            
    return merged_patterns
