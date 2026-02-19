import pandas as pd
import numpy as np
import datetime
from typing import Dict, Any, List

class PersonalAmountProfile:
    def __init__(self, account_id, window_days=90):
        self.account_id  = account_id
        self.window_days = window_days
        
        # Baselines
        self.sent_mean = 0
        self.sent_std = 1
        self.recv_mean = 0
        self.recv_std = 1
        self.p25 = 0
        self.p75 = 0
        self.p99 = 0
        self.known_counterparties = set()
        self.active_hours = set()
        self.daily_velocity = 0
        self.net_flow_direction = 'neutral'
        self.typical_sent_sum = 0
        self.typical_recv_sum = 0

    def fit(self, df: pd.DataFrame):
        # Filter for account transactions
        acct_txns = df[(df.sender_id == self.account_id) | (df.receiver_id == self.account_id)].copy()
        
        if acct_txns.empty:
            return self

        sent = acct_txns[acct_txns.sender_id == self.account_id]['amount']
        recv = acct_txns[acct_txns.receiver_id == self.account_id]['amount']

        self.sent_mean   = sent.mean() if len(sent) > 0 else 0
        self.sent_std    = sent.std()  if len(sent) > 1 else 1
        self.recv_mean   = recv.mean() if len(recv) > 0 else 0
        self.recv_std    = recv.std()  if len(recv) > 1 else 1

        # Personal transaction size percentiles
        all_amounts = pd.concat([sent, recv])
        if not all_amounts.empty:
            self.p25 = all_amounts.quantile(0.25)
            self.p75 = all_amounts.quantile(0.75)
            self.p99 = all_amounts.quantile(0.99)

        # Typical counterparties (who they normally transact with)
        sent_peers = acct_txns[acct_txns.sender_id == self.account_id]['receiver_id'].tolist()
        recv_peers = acct_txns[acct_txns.receiver_id == self.account_id]['sender_id'].tolist()
        self.known_counterparties = set(sent_peers + recv_peers)

        # Typical transaction hours (personal rhythm)
        # Assuming 'timestamp' is datetime
        hours = acct_txns['timestamp'].dt.hour
        self.active_hours = set(hours.value_counts().head(8).index.tolist()) # Top 8 hours

        # Typical velocity: transactions per day
        if len(acct_txns) > 1:
            span = (acct_txns.timestamp.max() - acct_txns.timestamp.min()).days
            self.daily_velocity = len(acct_txns) / max(span, 1)
        else:
            self.daily_velocity = len(acct_txns)

        # Typical net flow direction: are they usually a net sender or receiver?
        self.typical_recv_sum = recv.sum()
        self.typical_sent_sum = sent.sum()
        if self.typical_recv_sum > self.typical_sent_sum * 1.5:
             self.net_flow_direction = 'receiver'
        elif self.typical_sent_sum > self.typical_recv_sum * 1.5:
             self.net_flow_direction = 'sender'
        else:
             self.net_flow_direction = 'mixed'

        return self

    def score_new_transaction(self, txn: pd.Series, role: str) -> Dict[str, float]:
        """
        txn  : single transaction row (Pandas Series)
        role : 'sender' or 'receiver'
        """
        signals = {}

        if role == 'receiver':
            baseline_mean = self.recv_mean
            baseline_std  = max(self.recv_std, 1)  # avoid division by zero
        else:
            baseline_mean = self.sent_mean
            baseline_std  = max(self.sent_std, 1)
        
        amount = txn['amount']
        ts = txn['timestamp']
        
        # Signal 1: Amount z-score against personal history
        z_amount = (amount - baseline_mean) / baseline_std
        signals['amount_zscore'] = z_amount

        # Signal 2: Is this a new counterparty never seen before?
        counterparty = txn['receiver_id'] if role == 'sender' else txn['sender_id']
        signals['new_counterparty'] = 1.0 if counterparty not in self.known_counterparties else 0.0

        # Signal 3: Is the transaction at an unusual personal hour?
        txn_hour = ts.hour
        signals['unusual_hour'] = 1.0 if txn_hour not in self.active_hours else 0.0

        # Signal 4: Net flow reversal — account that normally sends now receives a lot
        if role == 'receiver' and self.net_flow_direction == 'sender':
            # Ratio of incoming amount to total typical outgoing volume
            flow_reversal_ratio = amount / max(self.typical_sent_sum, 1)
            signals['flow_reversal'] = flow_reversal_ratio
        else:
            signals['flow_reversal'] = 0.0

        # Signal 5: Amount relative to personal 99th percentile
        signals['above_p99'] = 1.0 if amount > self.p99 else 0.0
        signals['p99_ratio']  = amount / max(self.p99, 1)

        return signals

def compute_s1_score(signals: Dict[str, float], weights: Dict[str, float] = None) -> float:
    """
    Weights tuned for money mule detection.
    Flow reversal and new counterparty are the strongest signals.
    """
    if weights is None:
        weights = {
            'amount_zscore'  : 0.25,   # how unusual is the amount for this person
            'new_counterparty': 0.25,  # did money come from someone they've never dealt with
            'unusual_hour'   : 0.10,   # is this outside their personal active window
            'flow_reversal'  : 0.25,   # does a habitual sender suddenly receive large amounts
            'p99_ratio'      : 0.15,   # how far above their personal ceiling is this
        }

    # Normalize z-score to 0-1 (cap at z=5)
    z_norm = min(abs(signals.get('amount_zscore', 0)) / 5.0, 1.0)

    raw = (
        weights['amount_zscore']    * z_norm +
        weights['new_counterparty'] * signals.get('new_counterparty', 0) +
        weights['unusual_hour']     * signals.get('unusual_hour', 0) +
        weights['flow_reversal']    * min(signals.get('flow_reversal', 0), 1.0) +
        weights['p99_ratio']        * min(signals.get('p99_ratio', 0) / 5.0, 1.0) # Cap ratio impact at 5x
    )

    return round(raw * 100, 2)  # 0-100

def rapid_inflow_exit_detector(
    account_id: str, 
    df: pd.DataFrame, 
    inflow_window_hours: int = 6,
    exit_window_hours: int = 24,
    inflow_multiplier: float = 3.0
) -> List[Dict[str, Any]]:
    """
    Detects: large inbound payment followed by rapid exit to new destination.
    The 'new destination' check is what catches crypto exchanges specifically.
    """
    # Quick profile build (or reusing passed profile would be faster)
    profile = PersonalAmountProfile(account_id).fit(df)
    
    # Get all transactions chronologically
    acct_txns = df[(df.sender_id == account_id) | (df.receiver_id == account_id)].sort_values('timestamp')
    recv_txns = acct_txns[acct_txns.receiver_id == account_id]
    sent_txns = acct_txns[acct_txns.sender_id == account_id]

    alerts = []

    for _, inbound in recv_txns.iterrows():
        # Is this inbound amount unusual for this person?
        # Threshold: Mean + Multiplier * Std
        # Fix: If Profile has low variance (e.g. all transactions are $150), std is 0. 
        # Then threshold is just mean ($150). If inbound is $150, it is NOT > threshold.
        # We should use >= or add a buffer.
        # But also, if it's a new account, we shouldn't rely on "unusual".
        # For new accounts (low history), ANY large inflow is worth checking if it exits rapidly.
        
        is_anomalous = False
        if profile.recv_std < 10: # Low variance or single transaction history
             # If amount is significant (> 500) or just check flow
             if inbound['amount'] > 100:
                 is_anomalous = True
        else:
             personal_threshold = profile.recv_mean + (inflow_multiplier * profile.recv_std)
             if inbound['amount'] >= personal_threshold: # Use >=
                 is_anomalous = True
                 
        if not is_anomalous:
            continue

        # Check if money exits within exit_window after the inbound
        exit_window_end = inbound['timestamp'] + pd.Timedelta(hours=exit_window_hours)
        
        rapid_exits = sent_txns[
            (sent_txns['timestamp'] >= inbound['timestamp']) &
            (sent_txns['timestamp'] <= exit_window_end)
        ]

        if rapid_exits.empty:
            continue

        # Compute what fraction of the inbound amount was forwarded out
        exit_total    = rapid_exits['amount'].sum()
        passthrough_r = exit_total / inbound['amount']

        # Check if exits go to NEW counterparties (or low frenquency)
        # Since 'fit' sees the whole batch, the exit dest is technically "known".
        # We need to check if it's a "Frequent" counterparty.
        
        unknown_exits = []
        for _, exit_txn in rapid_exits.iterrows():
            dest = exit_txn['receiver_id']
            # If we processed enough history, we'd check if first_seen < now.
            # Determine if this destination is "Established"
            # Heuristic: If we only see it in this rapid exit burst (count low), it's new.
            
            # We can check global count in the dataframe for this account
            dest_count = sent_txns[sent_txns.receiver_id == dest].shape[0]
            
            if dest_count <= 2: # Appears only 1-2 times (likely just this exit)
                 unknown_exits.append(dest)
        
        new_dest_ratio = 0
        if len(rapid_exits) > 0:
            new_dest_ratio = len(unknown_exits) / len(rapid_exits)

        # Time from inbound to first exit (mins)
        first_exit_mins = (
            rapid_exits['timestamp'].min() - inbound['timestamp']
        ).total_seconds() / 60

        # Trigger logic
        if passthrough_r >= 0.8 and new_dest_ratio >= 0.5:
            # Critical: 80% pass through to >50% new destinations
            alerts.append({
                'account_id'       : account_id,
                'trigger_txn'      : inbound.name if hasattr(inbound, 'name') else 'idx', # Use index or ID
                'inbound_amount'   : float(inbound['amount']),
                'sender'           : inbound['sender_id'],
                'exit_amount'      : float(exit_total),
                'passthrough_ratio': round(passthrough_r, 3),
                'new_dest_ratio'   : round(new_dest_ratio, 3),
                'first_exit_mins'  : round(first_exit_mins, 1),
                'exit_destinations': rapid_exits['receiver_id'].tolist(),
                'risk_level'       : 'CRITICAL' if first_exit_mins < 60 else 'HIGH'
            })

    return alerts
