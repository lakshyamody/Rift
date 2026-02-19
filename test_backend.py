import pandas as pd
import sys
import os

# Function to test the backend logic without running the server
try:
    from backend.orchestrator import analyze_transactions
    print("Successfully imported backend logic.")
    
    # Create sample DataFrame
    data = {
        'transaction_id': ['T1', 'T2', 'T3'],
        'sender_id': ['A', 'B', 'C'],
        'receiver_id': ['B', 'C', 'A'],
        'amount': [100.0, 100.0, 100.0],
        'timestamp': ['2024-01-01 10:00:00', '2024-01-01 11:00:00', '2024-01-01 12:00:00']
    }
    df = pd.DataFrame(data)
    print("Created sample DataFrame.")
    
    result = analyze_transactions(df)
    print("Analysis complete.")
    print("Keys in result:", result.keys())
    print("Found cycles:", len(result['fraud_rings']))
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
