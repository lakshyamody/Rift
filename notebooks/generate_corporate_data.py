#!/usr/bin/env python3
"""
Corporate Financial Dataset Generator — NexusPay Financial Services Ltd.
Generates a large, realistic company transaction dataset (~8,000–10,000 rows)

Scenario: NexusPay is a mid-size B2B payments company.
  - Internal departments send/receive funds
  - Vendors, clients, subsidiaries, contractors transact regularly
  - Embedded fraud: rogue employees, corrupt vendor rings, shell subsidiaries

Usage: python3 generate_corporate_data.py
Output: data/corporate_transactions.csv, data/corporate_ground_truth.json
"""

import pandas as pd
import numpy as np
import random
import json
from datetime import datetime, timedelta
from pathlib import Path

random.seed(2026)
np.random.seed(2026)

OUTPUT_DIR = Path(__file__).parent.parent / 'data'
OUTPUT_DIR.mkdir(exist_ok=True)

BASE_DATE = datetime(2024, 6, 1, 9, 0, 0)
transactions = []
fraud_accounts = set()
fraud_rings = []
_ctr = [0]

def tid():
    _ctr[0] += 1
    return f'TXN-NX-{_ctr[0]:07d}'

# ─────────────────────────────────────────────────────────────────────────────
# ACCOUNT UNIVERSE — NexusPay Financial Services Ltd.
# ─────────────────────────────────────────────────────────────────────────────

# Internal departments
DEPARTMENTS = {
    'DEPT-TREASURY':    'Treasury & Settlements',
    'DEPT-PAYROLL':     'Payroll Processing',
    'DEPT-OPEX':        'Operational Expenses',
    'DEPT-MARKETING':   'Marketing & Growth',
    'DEPT-INFRA':       'Infrastructure & IT',
    'DEPT-COMPLIANCE':  'Compliance & Legal',
    'DEPT-FINANCE':     'Finance & Accounting',
    'DEPT-SALES':       'Sales Operations',
}

# Subsidiaries
SUBSIDIARIES = {
    'SUB-NEXUSPAY-SG':  'NexusPay Singapore Pte Ltd',
    'SUB-NEXUSPAY-AE':  'NexusPay Middle East FZE',
    'SUB-NEXUSPAY-UK':  'NexusPay Europe Ltd',
    'SUB-NEXUSPAY-US':  'NexusPay North America LLC',
    'SUB-NEXUSLEND':    'NexusLend Financial',
    'SUB-NEXUSCARDS':   'NexusCards Issuing',
}

# Legitimate vendors (high-volume, regular)
VENDORS = [f'VND-{str(i).zfill(4)}' for i in range(1, 61)]             # 60 vendors
VENDOR_NAMES = [
    'AWS Cloud Services', 'Salesforce Enterprise', 'Microsoft Azure', 'Google Workspace',
    'Twilio Communications', 'Stripe Connect', 'DataBricks Analytics', 'Snowflake DB',
    'PwC Audit Services', 'Deloitte Consulting', 'KPMG Advisory', 'EY Tax Services',
    'Clifford Chance LLP', 'Baker McKenzie', 'Allen & Overy', 'White & Case',
    'Goldman Sachs Prime', 'JP Morgan Custody', 'Citi Treasury', 'HSBC Trade Finance',
    'Deutsche Bank FX', 'Barclays Capital', 'UBS Securities', 'Credit Suisse',
    'Mastercard Network', 'Visa International', 'Swift GPI', 'BIS Payments',
    'Oracle Financial', 'SAP Treasury', 'Temenos Core', 'Finastra Fusion',
    'Bloomberg Terminal', 'Refinitiv Data', 'S&P Market Intel', 'Moody\'s Analytics',
    'Okta Identity', 'CrowdStrike Security', 'Palo Alto Networks', 'Zscaler Cloud',
    'WeWork London', 'Regus Singapore', 'CBRE Property', 'JLL Real Estate',
    'DHL Express', 'FedEx Business', 'UPS Logistics', 'Aramex MENA',
    'Meta Advertising', 'Google Ads', 'LinkedIn B2B', 'HubSpot CRM',
    'Zendesk Support', 'Intercom Chat', 'Atlassian Jira', 'Slack Enterprise',
    'DocuSign Legal', 'Adobe Sign', 'Dropbox Business', 'Box Enterprise'
]

# Clients (regular inbound revenue)
CLIENTS = [f'CLT-{str(i).zfill(5)}' for i in range(1, 151)]            # 150 clients

# Employees (payroll + expense reimbursement)
EMPLOYEES = [f'EMP-{str(i).zfill(5)}' for i in range(1, 201)]          # 200 employees

# Contractors
CONTRACTORS = [f'CTR-{str(i).zfill(4)}' for i in range(1, 41)]         # 40 contractors

# Correspondent banks / interbank settlement
BANKS = [
    'BANK-SWIFT-HSBCGB', 'BANK-SWIFT-CHASEUS', 'BANK-SWIFT-DBANGE',
    'BANK-SWIFT-SCBLSGX', 'BANK-SWIFT-FABGAEAD', 'BANK-SWIFT-AXISGB',
    'BANK-SWIFT-ICICISG', 'BANK-SWIFT-ABNAAE',
]

# ─────────────────────────────────────────────────────────────────────────────
# FRAUD ACTORS — embedded within the legitimate universe
# ─────────────────────────────────────────────────────────────────────────────

# Rogue employees (ghost payroll + kickback scheme)
ROGUE_EMPS = ['EMP-00087', 'EMP-00134', 'EMP-00192', 'EMP-00056', 'EMP-00111']

# Corrupt vendors (inflated invoices + kickback cycles)
CORRUPT_VENDORS = ['VND-0043', 'VND-0051', 'VND-0038', 'VND-0059', 'VND-0027']

# Shell subsidiaries (layered fund routing)
SHELL_SUBS = ['SUB-SHELL-01', 'SUB-SHELL-02', 'SUB-SHELL-03']

# Smurfing clients (fan-in → single aggregator)
SMURF_CLIENTS = [f'CLT-{str(i).zfill(5)}' for i in range(140, 151)]
SMURF_AGGREGATOR = 'EMP-00087'

ring_id_ctr = [1]

def next_rid():
    r = f'RING-NX-{ring_id_ctr[0]:03d}'
    ring_id_ctr[0] += 1
    return r

def rtime(base_days_offset=0, hour_range=(8, 20), jitter_mins=120):
    day = random.randint(0, 180)
    hour = random.randint(*hour_range)
    minute = random.randint(0, 59)
    return BASE_DATE + timedelta(days=day + base_days_offset, hours=hour, minutes=minute)

def txn(sender, receiver, amount, ts=None, memo=''):
    return {
        'transaction_id': tid(),
        'sender_id': sender,
        'receiver_id': receiver,
        'amount': round(amount, 2),
        'timestamp': (ts or rtime()).strftime('%Y-%m-%d %H:%M:%S'),
        'memo': memo,
    }

# ─────────────────────────────────────────────────────────────────────────────
# 1. LEGITIMATE OPERATIONS
# ─────────────────────────────────────────────────────────────────────────────
print("Generating legitimate operations...")

# Monthly payroll: DEPT-PAYROLL → all 200 employees (6 months)
for month in range(6):
    paydate = BASE_DATE + timedelta(days=month * 30, hours=9)
    for emp in EMPLOYEES:
        salary = random.uniform(4000, 18000)
        transactions.append(txn('DEPT-PAYROLL', emp, salary, paydate, 'Monthly salary'))

# Vendor payments: DEPT-OPEX / DEPT-INFRA → vendors (weekly-ish)
for _ in range(900):
    dept = random.choice(['DEPT-OPEX', 'DEPT-INFRA', 'DEPT-MARKETING', 'DEPT-SALES'])
    vendor = random.choice(VENDORS)
    amount = random.uniform(2000, 150000)
    transactions.append(txn(dept, vendor, amount, rtime(), 'Vendor invoice'))

# Client revenue: clients → DEPT-TREASURY
for client in CLIENTS:
    n_payments = random.randint(2, 15)
    for _ in range(n_payments):
        amount = random.uniform(5000, 500000)
        transactions.append(txn(client, 'DEPT-TREASURY', amount, rtime(), 'Client payment'))

# Interbank settlements: DEPT-TREASURY ↔ correspondent banks
for _ in range(400):
    bank = random.choice(BANKS)
    amount = random.uniform(100000, 5000000)
    direction = random.choice([
        ('DEPT-TREASURY', bank, 'Outbound settlement'),
        (bank, 'DEPT-TREASURY', 'Inbound settlement'),
    ])
    transactions.append(txn(direction[0], direction[1], amount, rtime(), direction[2]))

# Subsidiary fund transfers: HQ → subsidiaries (quarterly capital)
for sub in SUBSIDIARIES:
    for quarter in range(2):
        amount = random.uniform(500000, 3000000)
        ts = BASE_DATE + timedelta(days=quarter * 90 + random.randint(0, 5), hours=10)
        transactions.append(txn('DEPT-TREASURY', sub, amount, ts, 'Capital allocation'))
        # Subsidiaries also remit back
        remit = random.uniform(100000, 800000)
        ts2 = ts + timedelta(days=random.randint(5, 30))
        transactions.append(txn(sub, 'DEPT-TREASURY', remit, ts2, 'Dividend remittance'))

# Contractor payments: DEPT-OPEX → contractors
for _ in range(320):
    ctr = random.choice(CONTRACTORS)
    amount = random.uniform(3000, 45000)
    transactions.append(txn('DEPT-OPEX', ctr, amount, rtime(), 'Contractor invoice'))

# Employee expense reimbursements
for _ in range(600):
    emp = random.choice(EMPLOYEES)
    amount = random.uniform(50, 3000)
    transactions.append(txn('DEPT-FINANCE', emp, amount, rtime(), 'Expense reimbursement'))

# Intercompany loans / transfers between subsidiaries
for _ in range(80):
    s1, s2 = random.sample(list(SUBSIDIARIES.keys()), 2)
    amount = random.uniform(50000, 500000)
    transactions.append(txn(s1, s2, amount, rtime(), 'Intercompany transfer'))

print(f"  Legitimate transactions so far: {len(transactions)}")


# ─────────────────────────────────────────────────────────────────────────────
# 2. FRAUD PATTERN A — CYCLE RINGS (Kickback Triangles)
# ─────────────────────────────────────────────────────────────────────────────
print("Injecting Fraud Pattern A: Kickback Cycles...")

cycle_rings_meta = []

# 3-node cycles: Corrupt vendor → rogue employee → shell → back to vendor
for i in range(12):
    vendor = CORRUPT_VENDORS[i % len(CORRUPT_VENDORS)]
    rogue  = ROGUE_EMPS[i % len(ROGUE_EMPS)]
    shell  = SHELL_SUBS[i % len(SHELL_SUBS)]
    t = rtime(jitter_mins=30)
    amt = random.uniform(8000, 60000)
    rid = next_rid()
    members = [vendor, rogue, shell]
    # Vendor overpays rogue (kickback), rogue routes to shell, shell pays vendor
    transactions.append(txn(vendor, rogue, amt * 0.15, t, 'Consultancy fee'))
    transactions.append(txn(rogue, shell, amt * 0.12, t + timedelta(hours=3), 'Management fee'))
    transactions.append(txn(shell, vendor, amt * 0.10, t + timedelta(hours=8), 'Service retainer'))
    for m in members: fraud_accounts.add(m)
    fraud_rings.append({'ring_id': rid, 'type': 'cycle_length_3', 'members': members, 'pattern': 'kickback_triangle'})
    cycle_rings_meta.append(members)

# 4-node cycles: DEPT-OPEX → vendor → shell1 → rogue emp → back to DEPT-OPEX account
for i in range(8):
    dept = 'DEPT-OPEX'
    vendor = CORRUPT_VENDORS[i % len(CORRUPT_VENDORS)]
    shell = SHELL_SUBS[i % 2]
    rogue = ROGUE_EMPS[(i + 2) % len(ROGUE_EMPS)]
    intermediate = f'CTR-{str(30 + i).zfill(4)}'  # contractor used as pass-through
    t = rtime()
    amt = random.uniform(15000, 80000)
    rid = next_rid()
    members = [vendor, rogue, shell, intermediate]
    transactions.append(txn(vendor, rogue, amt * 0.2, t))
    transactions.append(txn(rogue, shell, amt * 0.18, t + timedelta(hours=4)))
    transactions.append(txn(shell, intermediate, amt * 0.15, t + timedelta(hours=10)))
    transactions.append(txn(intermediate, vendor, amt * 0.12, t + timedelta(hours=18)))
    for m in members: fraud_accounts.add(m)
    fraud_rings.append({'ring_id': rid, 'type': 'cycle_length_4', 'members': members, 'pattern': 'layered_kickback'})

# 5-node cycles: cross-subsidiary round-trip
for i in range(5):
    path = [
        SHELL_SUBS[0],
        CORRUPT_VENDORS[i % len(CORRUPT_VENDORS)],
        f'CTR-{str(25 + i).zfill(4)}',
        ROGUE_EMPS[i % len(ROGUE_EMPS)],
        SHELL_SUBS[1],
    ]
    t = rtime()
    amt = random.uniform(25000, 120000)
    rid = next_rid()
    for j in range(len(path)):
        transactions.append(txn(path[j], path[(j+1) % len(path)], amt * 0.18, t + timedelta(hours=j * 6)))
    for m in path: fraud_accounts.add(m)
    fraud_rings.append({'ring_id': rid, 'type': 'cycle_length_5', 'members': path, 'pattern': 'cross_entity_round_trip'})

print(f"  After fraud A (cycles): {len(transactions)}")


# ─────────────────────────────────────────────────────────────────────────────
# 3. FRAUD PATTERN B — SMURFING (Ghost Clients Fan-in to Rogue Employee)
# ─────────────────────────────────────────────────────────────────────────────
print("Injecting Fraud Pattern B: Smurfing (Fan-in / Fan-out)...")

for batch in range(8):
    aggregator = random.choice(ROGUE_EMPS)
    # Fan-in: 12–15 ghost clients send small amounts to aggregator within 48h
    n_senders = random.randint(12, 15)
    ghost_clients = [f'CLT-{str(random.randint(9800, 9999)).zfill(5)}' for _ in range(n_senders)]
    t_base = rtime()
    for gc in ghost_clients:
        amount = random.uniform(800, 4999)  # just under $5K reporting threshold
        ts = t_base + timedelta(hours=random.uniform(0, 48))
        transactions.append(txn(gc, aggregator, amount, ts, 'Platform credit'))
        fraud_accounts.add(gc)

    # Fan-out: aggregator distributes to shell companies within next 24h
    shell_receivers = [SHELL_SUBS[i % len(SHELL_SUBS)] for i in range(random.randint(10, 12))]
    for shell in shell_receivers:
        amount = random.uniform(3000, 9500)
        ts = t_base + timedelta(hours=random.uniform(48, 72))
        transactions.append(txn(aggregator, shell, amount, ts, 'Consulting retainer'))
        fraud_accounts.add(shell)

    fraud_accounts.add(aggregator)
    rid = next_rid()
    all_members = [aggregator] + ghost_clients + list(set(shell_receivers))
    fraud_rings.append({'ring_id': rid, 'type': 'smurfing', 'members': all_members, 'pattern': 'fan_in_fan_out'})

print(f"  After fraud B (smurfing): {len(transactions)}")


# ─────────────────────────────────────────────────────────────────────────────
# 4. FRAUD PATTERN C — SHELL NETWORK (Layered Subsidiary Routing)
# ─────────────────────────────────────────────────────────────────────────────
print("Injecting Fraud Pattern C: Shell Networks...")

for i in range(10):
    # Source → Shell1 → Shell2 → offshore destination (disguised as interbank)
    source = random.choice(ROGUE_EMPS)
    shell1 = SHELL_SUBS[0]
    shell2 = SHELL_SUBS[1]
    offshore = f'BANK-OFFSHR-{str(i+1).zfill(3)}'  # fake offshore bank
    t = rtime()
    amt = random.uniform(40000, 250000)
    rid = next_rid()
    chain = [source, shell1, shell2, offshore]
    for j in range(len(chain) - 1):
        transactions.append(txn(chain[j], chain[j+1],
                                amt * (0.97 ** j),
                                t + timedelta(hours=j * 8 + random.uniform(0, 2)),
                                'Wire transfer'))
    for m in chain: fraud_accounts.add(m)
    fraud_rings.append({'ring_id': rid, 'type': 'shell_network', 'members': chain, 'pattern': 'offshore_routing'})

# Extended 4-hop shell chain
for i in range(5):
    chain = [
        ROGUE_EMPS[i % len(ROGUE_EMPS)],
        SHELL_SUBS[0],
        CORRUPT_VENDORS[i % len(CORRUPT_VENDORS)],
        SHELL_SUBS[2],
        f'BANK-OFFSHR-{str(i + 11).zfill(3)}',
    ]
    t = rtime()
    amt = random.uniform(30000, 180000)
    rid = next_rid()
    for j in range(len(chain) - 1):
        transactions.append(txn(chain[j], chain[j+1], amt * (0.95 ** j), t + timedelta(hours=j * 12)))
    for m in chain: fraud_accounts.add(m)
    fraud_rings.append({'ring_id': rid, 'type': 'shell_network', 'members': chain, 'pattern': 'multi_hop_offshore'})

print(f"  After fraud C (shell networks): {len(transactions)}")


# ─────────────────────────────────────────────────────────────────────────────
# 5. LEGITIMATE HIGH-VOLUME TRAPS (False Positive Decoys)
# ─────────────────────────────────────────────────────────────────────────────
print("Injecting legitimate traps (high-volume, NOT fraud)...")

# Large client — sends 300+ transactions (legitimate enterprise client)
LARGE_CLIENT = 'CLT-00001'
for _ in range(350):
    amount = random.uniform(10000, 2000000)
    transactions.append(txn(LARGE_CLIENT, 'DEPT-TREASURY', amount, rtime(), 'Enterprise license fee'))

# High-frequency bank settlement (legitimate daily netting)
SETTLEMENT_BANK = 'BANK-SWIFT-HSBCGB'
for _ in range(250):
    amount = random.uniform(500000, 10000000)
    direction = random.choice(['in', 'out'])
    if direction == 'in':
        transactions.append(txn(SETTLEMENT_BANK, 'DEPT-TREASURY', amount, rtime(), 'Net settlement in'))
    else:
        transactions.append(txn('DEPT-TREASURY', SETTLEMENT_BANK, amount, rtime(), 'Net settlement out'))

# Payroll mirror — regular large outflows (NOT money muling)
for month in range(6):
    paydate = BASE_DATE + timedelta(days=month * 30 + 1, hours=9, minutes=30)
    bonus = random.uniform(200000, 800000)
    transactions.append(txn('DEPT-PAYROLL', 'DEPT-FINANCE', bonus, paydate, 'Payroll reconciliation'))

print(f"  Total transactions: {len(transactions)}")


# ─────────────────────────────────────────────────────────────────────────────
# 6. SAVE
# ─────────────────────────────────────────────────────────────────────────────
random.shuffle(transactions)

# Only keep required CSV columns
df = pd.DataFrame(transactions)[['transaction_id', 'sender_id', 'receiver_id', 'amount', 'timestamp']]
df = df.drop_duplicates(subset=['transaction_id'])

csv_path = OUTPUT_DIR / 'corporate_transactions.csv'
df.to_csv(csv_path, index=False)

ground_truth = {
    'company': 'NexusPay Financial Services Ltd.',
    'scenario': 'Realistic corporate B2B payments with embedded fraud patterns',
    'fraud_accounts': sorted(list(fraud_accounts)),
    'fraud_rings': fraud_rings,
    'total_fraud_accounts': len(fraud_accounts),
    'total_rings': len(fraud_rings),
    'legitimate_high_volume_traps': {
        'large_enterprise_client': LARGE_CLIENT,
        'settlement_bank': SETTLEMENT_BANK,
        'payroll_dept': 'DEPT-PAYROLL',
        'treasury': 'DEPT-TREASURY',
    },
    'account_categories': {
        'departments': list(DEPARTMENTS.keys()),
        'subsidiaries': list(SUBSIDIARIES.keys()),
        'vendors': VENDORS[:10],
        'clients': CLIENTS[:10],
        'employees': EMPLOYEES[:10],
    },
}

gt_path = OUTPUT_DIR / 'corporate_ground_truth.json'
with open(gt_path, 'w') as f:
    json.dump(ground_truth, f, indent=2)

print(f"\n{'='*55}")
print(f"  CORPORATE DATASET GENERATED — NexusPay Financial Services Ltd.")
print(f"{'='*55}")
print(f"  CSV:   {csv_path}")
print(f"  Rows:  {len(df):,}")
print(f"  Unique Accounts: {len(set(df['sender_id']) | set(df['receiver_id'])):,}")
print(f"  Date Range: {df['timestamp'].min()} — {df['timestamp'].max()}")
print(f"\n  Fraud Accounts:  {len(fraud_accounts)}")
print(f"  Fraud Rings:     {len(fraud_rings)}")
ring_types = {}
for r in fraud_rings:
    ring_types[r['type']] = ring_types.get(r['type'], 0) + 1
for t, c in sorted(ring_types.items()):
    print(f"    {t:25s}: {c}")
print(f"\n  Legitimate Traps: DEPT-PAYROLL (payroll), {LARGE_CLIENT} (enterprise client), {SETTLEMENT_BANK} (bank)")
print(f"{'='*55}")
print(f"\n  Columns: {list(df.columns)}")
print(f"  Sample rows:")
print(df.head(5).to_string(index=False))
