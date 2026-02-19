# Money Muling Detection Engine

This project implements a backend for detecting money muling rings using Graph Theory and Machine Learning.

## Features

- **Graph Analysis**: Detects circular fund routing (cycles) and smurfing patterns (fan-in/fan-out).
- **Machine Learning**: Uses Isolation Forest to assign suspicion scores based on transaction volume and frequency.
- **API**: FastAPI backend to process transaction CSVs and return JSON analysis.

## Project Structure

- `backend/`: FastAPI application source code.
  - `main.py`: API entry point.
  - `utils.py`: Core logic for graph construction and fraud detection.
  - `models.py`: Data models.
- `notebooks/`: Jupyter Notebook for data exploration and algorithm testing.
- `data/`: Sample datasets.

## Setup

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run Backend**:
   ```bash
   uvicorn backend.main:app --reload
   ```
   The API will be available at `http://127.0.0.1:8000`.
   Swagger UI is available at `http://127.0.0.1:8000/docs`.

3. **Run Notebook**:
   ```bash
   jupyter notebook notebooks/analysis.ipynb
   ```

## API Usage

**Endpoint**: `POST /detect`
**Input**: CSV file with columns: `transaction_id`, `sender_id`, `receiver_id`, `amount`, `timestamp`.

**Example using curl**:
```bash
curl -X POST "http://127.0.0.1:8000/detect" -F "file=@data/sample_transactions.csv"
```
