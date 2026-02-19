import time
import pandas as pd
import random
from datetime import datetime, timedelta
import numpy as np

from backend.orchestrator import analyze_transactions

def generate_benchmark_data(num_tx=10000):
    """
    Generates data with known ground truth for:
    - Normal users (Random)
    - Merchants (Fan-In High Volume)
    - Payroll (Fan-Out High Volume)
    - Fraud: Cycles (3-5 hops)
    - Fraud: Smurfing (Fan-In/Out rapid)
    """
    print(f"Generating {num_tx} transactions...")
    accounts = [f"ACC_{i}" for i in range(10000)]
    merchants = [f"MERCH_{i}" for i in range(20)]
    payroll = [f"PAYROLL_{i}" for i in range(10)]
    
    all_entities = accounts + merchants + payroll
    data = []
    base_time = datetime.now()
    
    known_fraudsters = set()
    known_legit_high_volume = set(merchants + payroll)
    
    # 1. Background Noise (Normal Txs) - 80% volume
    for i in range(int(num_tx * 0.8)):
        sender = random.choice(accounts)
        receiver = random.choice(all_entities)
        if sender == receiver: continue
        
        amt = round(random.uniform(10, 500), 2)
        ts = base_time + timedelta(minutes=random.randint(0, 10000))
        data.append({"sender_id": sender, "receiver_id": receiver, "amount": amt, "timestamp": ts, "transaction_id": f"TX_{len(data)}"})

    # 2. Inject Fraud: Cycles (Aim for ~50 fraudsters)
    print("Injecting Fraud Cycles...")
    for _ in range(10):
        length = random.randint(3, 5)
        cycle_members = random.sample(accounts, length)
        known_fraudsters.update(cycle_members)
        
        amt = 1000.0
        start_ts = base_time + timedelta(minutes=random.randint(100, 5000))
        
        for i in range(length):
            sender = cycle_members[i]
            receiver = cycle_members[(i + 1) % length]
            # Rapid execution
            ts = start_ts + timedelta(minutes=i*10) 
            # Small decay
            amount = amt * (0.98 ** i)
            data.append({"sender_id": sender, "receiver_id": receiver, "amount": round(amount, 2), "timestamp": ts, "transaction_id": f"FRAUD_CYC_{len(data)}"})
            
    # 3. Inject Fraud: Smurfing (Layering)
    print("Injecting Smurfing...")
    for _ in range(5):
        center = random.choice(accounts)
        mules = random.sample(accounts, 12)
        known_fraudsters.add(center)
        known_fraudsters.update(mules)
        
        # Fan-In
        ts = base_time + timedelta(minutes=random.randint(1000, 8000))
        for mule in mules:
            data.append({"sender_id": mule, "receiver_id": center, "amount": 900, "timestamp": ts + timedelta(seconds=random.randint(0, 300)), "transaction_id": f"FRAUD_SMURF_IN_{len(data)}"})
            
    # 4. Inject Legit High Volume: Merchants (Fan-In)
    print("Injecting Merchant Activity...")
    for m in merchants:
        # Received 50 txs
        for _ in range(50):
            sender = random.choice(accounts)
            data.append({"sender_id": sender, "receiver_id": m, "amount": random.uniform(20, 100), "timestamp": base_time + timedelta(minutes=random.randint(0, 10000)), "transaction_id": f"LEGIT_MERCH_{len(data)}"})

    # 5. Inject Legit High Volume: Payroll (Fan-Out)
    print("Injecting Payroll Activity...")
    for p in payroll:
        # Sends 50 txs
        for _ in range(50):
            receiver = random.choice(accounts)
            data.append({"sender_id": p, "receiver_id": receiver, "amount": random.uniform(2000, 2500), "timestamp": base_time + timedelta(minutes=random.randint(0, 10000)), "transaction_id": f"LEGIT_PAY_{len(data)}"})

    df = pd.DataFrame(data)
    print(f"Total Transactions: {len(df)}")
    return df, known_fraudsters, known_legit_high_volume

def benchmark():
    # 1. Generate TRAINING Data (Synthetic "Past" Data)
    print("\n--- Generating Training Data (Historical) ---")
    df_train, train_fraudsters, _ = generate_benchmark_data(5000)
    
    # Create Labels for Training
    # Known Fraudsters = 1, Everyone else = 0
    # In reality, we'd have confirmed fraud labels.
    labels = {}
    all_train_accounts = set(df_train['sender_id']) | set(df_train['receiver_id'])
    for acc in all_train_accounts:
        labels[acc] = 1 if acc in train_fraudsters else 0
        
    # 2. Train the Model
    from backend.ml.supervised_model import SupervisedFraudModel
    model = SupervisedFraudModel()
    model.train(df_train, labels)
    
    # 3. Generate TESTING Data (New "Current" Batch)
    print("\n--- Generating Testing Data (Current) ---")
    df_test, test_fraudsters, test_legit = generate_benchmark_data(10000)
    
    print("\n--- Starting Benchmark on Test Data ---")
    start_time = time.time()
    
    # Analyze (Orchestrator will now pick up the trained model)
    results = analyze_transactions(df_test)
    
    end_time = time.time()
    
    processing_time = end_time - start_time
    print(f"Processing Time: {processing_time:.4f} seconds (Target: < 30s)")
    
    # Evaluate Precision/Recall
    detected_accounts = set()
    for acc in results['suspicious_accounts']:
        detected_accounts.add(acc['account_id'])
        
    true_positives = len(detected_accounts.intersection(test_fraudsters))
    false_positives = len(detected_accounts - test_fraudsters)
    false_negatives = len(test_fraudsters - detected_accounts)
    
    precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0
    recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    
    print(f"\n--- Accuracy Metrics (XGBoost + Embeddings) ---")
    print(f"Precision: {precision:.2%} (Target: > 80%)")
    print(f"Recall:    {recall:.2%} (Target: > 70%)")
    print(f"F1 Score:  {f1:.2f}")
    
    print(f"\n--- False Positive Analysis ---")
    # Check if any Merchants/Payroll were flagged
    bad_flags = detected_accounts.intersection(test_legit)
    print(f"Legitimate High-Volume Accounts Flagged: {len(bad_flags)}")
    if bad_flags:
        print(f"  -> FLAGGED: {list(bad_flags)[:5]}")
    else:
        print("  -> None. (Pass)")
        
    print(f"\n--- Overfitting/Underfitting Check ---")
    if precision > 0.95 and recall > 0.95:
        print("Suspiciously High Accuracy? Dataset might be too easy or model overfitting to synthetic patterns.")
    elif precision < 0.6:
        print("Low Precision -> Potential Underfitting (Too loose)")
    elif recall < 0.6:
        print("Low Recall -> Potential Underfitting (Too strict)")
    else:
        print("Balanced Performance. Model seems healthy.")

if __name__ == "__main__":
    benchmark()
