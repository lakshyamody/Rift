#!/usr/bin/env python3
"""
Standalone synthetic data generator — run this to create data/sample_transactions.csv
Usage: python3 generate_data.py
"""
import pandas as pd
import numpy as np
import random
import json
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)
np.random.seed(42)

OUTPUT_DIR = Path(__file__).parent.parent / 'data'
OUTPUT_DIR.mkdir(exist_ok=True)

BASE_DATE = datetime(2024, 1, 1, 8, 0, 0)
transactions = []
ground_truth_accounts = set()
ground_truth_rings = []
_counter = [0]

def txn_id():
    _counter[0] += 1
    return f'TXN_{_counter[0]:06d}'

def acc(n):
    return f'ACC_{n:05d}'

print("Generating synthetic transaction data...")

# ── 1. CYCLE PATTERNS ─────────────────────────────────────────────────────────
ring_id = 1
acc_start = 1000

for length in [3, 4, 5]:
    count = {3: 20, 4: 15, 5: 10}[length]
    for _ in range(count):
        members = [acc(acc_start + i) for i in range(length)]
        acc_start += length
        t = BASE_DATE + timedelta(days=random.randint(0, 60))
        for i in range(length):
            transactions.append({
                'transaction_id': txn_id(),
                'sender_id': members[i],
                'receiver_id': members[(i + 1) % length],
                'amount': round(random.uniform(500, 5000), 2),
                'timestamp': (t + timedelta(hours=i * 2)).strftime('%Y-%m-%d %H:%M:%S'),
            })
        for m in members: ground_truth_accounts.add(m)
        ground_truth_rings.append({
            'ring_id': f'RING_{ring_id:03d}',
            'type': f'cycle_length_{length}',
            'members': members
        })
        ring_id += 1

print(f"  Cycles: {len(transactions)} transactions so far")

# ── 2. SMURFING PATTERNS ──────────────────────────────────────────────────────
for _ in range(15):
    aggregator = acc(acc_start); acc_start += 1
    senders   = [acc(acc_start + i) for i in range(12)]; acc_start += 12
    receivers = [acc(acc_start + i) for i in range(12)]; acc_start += 12
    t = BASE_DATE + timedelta(days=random.randint(0, 60))
    for s in senders:
        transactions.append({
            'transaction_id': txn_id(),
            'sender_id': s,
            'receiver_id': aggregator,
            'amount': round(random.uniform(1000, 9999), 2),
            'timestamp': (t + timedelta(hours=random.uniform(0, 48))).strftime('%Y-%m-%d %H:%M:%S'),
        })
    for r in receivers:
        transactions.append({
            'transaction_id': txn_id(),
            'sender_id': aggregator,
            'receiver_id': r,
            'amount': round(random.uniform(500, 5000), 2),
            'timestamp': (t + timedelta(hours=random.uniform(48, 72))).strftime('%Y-%m-%d %H:%M:%S'),
        })
    members = [aggregator] + senders + receivers
    for m in members: ground_truth_accounts.add(m)
    ground_truth_rings.append({'ring_id': f'RING_{ring_id:03d}', 'type': 'smurfing', 'members': members})
    ring_id += 1

print(f"  Smurfing: {len(transactions)} transactions so far")

# ── 3. SHELL NETWORKS ─────────────────────────────────────────────────────────
for _ in range(10):
    chain = [acc(acc_start + i) for i in range(4)]
    acc_start += 4
    t = BASE_DATE + timedelta(days=random.randint(0, 60))
    for i in range(3):
        transactions.append({
            'transaction_id': txn_id(),
            'sender_id': chain[i],
            'receiver_id': chain[i + 1],
            'amount': round(random.uniform(5000, 50000), 2),
            'timestamp': (t + timedelta(hours=i * 6 + random.uniform(0, 3))).strftime('%Y-%m-%d %H:%M:%S'),
        })
    for m in chain: ground_truth_accounts.add(m)
    ground_truth_rings.append({'ring_id': f'RING_{ring_id:03d}', 'type': 'shell_network', 'members': chain})
    ring_id += 1

print(f"  Shell networks: {len(transactions)} transactions so far")

# ── 4. LEGITIMATE ACCOUNT TRAPS ───────────────────────────────────────────────
merchant = acc(9000)
for i in range(200):
    buyer = acc(9100 + i)
    t = BASE_DATE + timedelta(days=i // 5, hours=random.uniform(0, 24))
    transactions.append({
        'transaction_id': txn_id(),
        'sender_id': buyer,
        'receiver_id': merchant,
        'amount': round(random.uniform(10, 500), 2),
        'timestamp': t.strftime('%Y-%m-%d %H:%M:%S'),
    })

employer = acc(9500)
for i in range(60):
    emp = acc(9600 + i)
    for month in range(3):
        t = BASE_DATE + timedelta(days=month * 30, hours=9)
        transactions.append({
            'transaction_id': txn_id(),
            'sender_id': employer,
            'receiver_id': emp,
            'amount': round(random.uniform(3000, 8000), 2),
            'timestamp': t.strftime('%Y-%m-%d %H:%M:%S'),
        })

normal_accs = [acc(10000 + i) for i in range(300)]
for _ in range(1500):
    s, r = random.sample(normal_accs, 2)
    t = BASE_DATE + timedelta(days=random.randint(0, 90), hours=random.uniform(0, 24))
    transactions.append({
        'transaction_id': txn_id(),
        'sender_id': s,
        'receiver_id': r,
        'amount': round(random.uniform(50, 10000), 2),
        'timestamp': t.strftime('%Y-%m-%d %H:%M:%S'),
    })

print(f"  Legitimate traps + normal: {len(transactions)} total transactions")

# ── 5. SAVE ───────────────────────────────────────────────────────────────────
random.shuffle(transactions)
df = pd.DataFrame(transactions).drop_duplicates(subset=['transaction_id'])
csv_path = OUTPUT_DIR / 'sample_transactions.csv'
df.to_csv(csv_path, index=False)

ground_truth = {
    'fraud_accounts': sorted(list(ground_truth_accounts)),
    'fraud_rings': ground_truth_rings,
    'total_fraud_accounts': len(ground_truth_accounts),
    'total_rings': len(ground_truth_rings),
    'legitimate_traps': {
        'high_volume_merchant': merchant,
        'payroll_employer': employer,
    }
}
with open(OUTPUT_DIR / 'ground_truth.json', 'w') as f:
    json.dump(ground_truth, f, indent=2)

print(f"\n✅ Generated: {csv_path}")
print(f"   Rows: {len(df)}")
print(f"   Fraud accounts: {len(ground_truth_accounts)}")
print(f"   Fraud rings: {len(ground_truth_rings)}")
print(f"   Columns: {list(df.columns)}")
