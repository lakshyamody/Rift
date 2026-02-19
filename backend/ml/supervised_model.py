import pandas as pd
import numpy as np
import xgboost as xgb
from typing import Dict, List, Any
import pickle
import os

from .graph_embeddings import generate_graph_embeddings
from ..core.graph import build_graph
from ..features.extractor import extract_features

class SupervisedFraudModel:
    def __init__(self, model_path: str = "fraud_model_xgb.pkl"):
        self.model_path = model_path
        self.model = None
        self.is_trained = False
        
    def train(self, df_train: pd.DataFrame, labels: Dict[str, int]):
        """
        Trains the XGBoost model on the provided dataframe and labels.
        Labels: Dict mapping account_id to 0 (legit) or 1 (fraud).
        """
        print("Training XGBoost Model...")
        
        # 1. Build Graph & Embeddings
        G = build_graph(df_train)
        embeddings = generate_graph_embeddings(G, embedding_dim=32) # Smaller dim for speed
        
        # 2. Extract Features
        features_df = extract_features(df_train, G)
        
        # 3. Merge Embeddings
        embedding_df = pd.DataFrame.from_dict(embeddings, orient='index')
        embedding_df.columns = [f"emb_{i}" for i in range(embedding_df.shape[1])]
        
        # Join
        X_df = features_df.join(embedding_df, how='inner').fillna(0)
        
        # 4. Prepare Y
        # Filter to accounts we have labels for
        labeled_accounts = [acc for acc in X_df.index if acc in labels]
        if not labeled_accounts:
            print("No labeled accounts found for training.")
            return

        X = X_df.loc[labeled_accounts]
        y = [labels[acc] for acc in labeled_accounts]
        
        # 5. Train XGBoost
        self.model = xgb.XGBClassifier(
            objective='binary:logistic',
            n_estimators=100,
            learning_rate=0.1,
            max_depth=6,
            random_state=42,
            eval_metric='logloss'
        )
        self.model.fit(X, y)
        self.is_trained = True
        
        # Save Features list for inference
        self.feature_names = X.columns.tolist()
        
        # Save Model
        with open(self.model_path, 'wb') as f:
            pickle.dump({'model': self.model, 'features': self.feature_names}, f)
            
        print("Model Trained and Saved.")
        
    def predict(self, df_infer: pd.DataFrame) -> Dict[str, float]:
        """
        Predicts fraud probability for accounts in df_infer.
        Returns: Dict[account_id, probability_score_0_to_100]
        """
        if not self.is_trained:
            # Try load
            if os.path.exists(self.model_path):
                with open(self.model_path, 'rb') as f:
                    data = pickle.load(f)
                    self.model = data['model']
                    self.feature_names = data['features']
                    self.is_trained = True
            else:
                print("Model not trained. Returning 0s.")
                # Return 0s for all unique accounts
                accounts = set(df_infer['sender_id']) | set(df_infer['receiver_id'])
                return {acc: 0.0 for acc in accounts}
                
        # 1. Build Graph & Embeddings (Inference Mode)
        G = build_graph(df_infer)
        embeddings = generate_graph_embeddings(G, embedding_dim=32)
        
        # 2. Extract Features
        features_df = extract_features(df_infer, G)
        
        # 3. Merge Embeddings
        embedding_df = pd.DataFrame.from_dict(embeddings, orient='index')
        embedding_df.columns = [f"emb_{i}" for i in range(embedding_df.shape[1])]
        
        # Join
        X_df = features_df.join(embedding_df, how='left').fillna(0)
        
        # 4. Align Features
        # Ensure columns match training
        for col in self.feature_names:
            if col not in X_df.columns:
                X_df[col] = 0
        
        X = X_df[self.feature_names]
        
        # 5. Predict
        probs = self.model.predict_proba(X)[:, 1] # Probability of Class 1 (Fraud)
        
        # Map back to accounts
        results = {acc: float(prob * 100) for acc, prob in zip(X.index, probs)}
        return results
