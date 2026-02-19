# RIFT 2026 — Money Muling Detection Engine

> **Graph-Based Financial Crime Detection** | RIFT 2026 Hackathon · Graph Theory Track

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2FVite-61dafb?style=flat-square&logo=react)](https://vitejs.dev/)
[![NetworkX](https://img.shields.io/badge/Graph-NetworkX-orange?style=flat-square)](https://networkx.org/)

## Live Demo
> **[ADD DEPLOYED URL HERE]**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI (Python 3.9+) |
| Graph Engine | NetworkX 3.x |
| Data Processing | Pandas |
| Frontend | React 18 + Vite |
| Graph Visualization | Cytoscape.js |
| Deployment | Render (backend) + Vercel (frontend) |

---

## System Architecture

```
CSV Upload → FastAPI /api/analyze
                ↓
        graph/builder.py     ← Parse CSV, build DiGraph
                ↓
    ┌──────────────────────────┐
    │  cycle_detector.py       │  Johnson's algorithm (3–5 hop cycles)
    │  smurfing_detector.py    │  Fan-in/fan-out with 72hr temporal window
    │  shell_detector.py       │  DFS chains with low-activity intermediates
    └──────────────────────────┘
                ↓
        scorer.py             ← Additive suspicion scores (0–100)
        pipeline.py           ← Ring ID assignment + JSON assembly
                ↓
    JSON response → React frontend
    ├── GraphView (Cytoscape.js)
    ├── StatsCards
    ├── RingTable
    └── NodeDetailPanel
```

---

## Algorithm Approach

### 1. Cycle Detection (Circular Fund Routing)
- **Algorithm**: Johnson's algorithm via `networkx.simple_cycles()`
- **Complexity**: O((V + E)(C + 1)) where C = number of simple cycles
- **Filter**: Only cycles of length 3–5 are flagged
- **Ring assignment**: Each unique cycle → `RING_XXX` with `pattern_type: "cycle"`

### 2. Smurfing Detection (Fan-in / Fan-out)
- **Algorithm**: Sliding 72-hour temporal window per node
- **Threshold**: ≥10 unique counterparties in any 72-hour window
- **Complexity**: O(N × T log T) per node where T = transaction count
- **False positive guard**: Nodes with 50+ unique counterparties overall → excluded (payroll/merchant)

### 3. Shell Network Detection
- **Algorithm**: DFS path exploration up to depth 5
- **Criteria**: Chain length ≥3 where intermediate nodes have ≤3 total transactions
- **Complexity**: O(V × E) worst case (bounded by depth limit)

---

## Suspicion Score Methodology

Additive scoring model (capped at 100):

| Signal | Points | Rationale |
|--------|--------|-----------|
| In a detected cycle | +40 | Strongest indicator of deliberate routing |
| Smurfing (fan-in or fan-out) | +25 | Structuring behavior |
| Shell network node | +20 | Pass-through with minimal activity |
| High velocity (>5 txns/24h) | +10 | Rapid layering |
| Round-number amounts (>60%) | +5 | Classic smurfing indicator |

**Output**: Sorted descending by `suspicion_score`, range [0, 100].

---

## False Positive Control

Two-tier protection against flagging legitimate accounts:

1. **Payroll guard**: Accounts with ≥50 unique counterparties are never flagged for smurfing
2. **Merchant guard**: Same counterparty threshold protects high-volume merchants
3. **Shell guard**: Only intermediate nodes with ≤3 total transactions are considered shells (protects active transactors)

---

## Installation & Setup

### Backend
```bash
cd backend
pip3 install -r requirements.txt
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

### Generate Synthetic Data
```bash
python3 notebooks/generate_data.py
# Outputs: data/sample_transactions.csv (2440 rows, 70 fraud rings)
```

---

## Usage Instructions

1. Open the web app at `http://localhost:5173`
2. Drag & drop (or click to upload) a CSV file with columns:
   `transaction_id, sender_id, receiver_id, amount, timestamp`
3. Click **"Analyze Transactions"** — results appear in ≤30 seconds
4. Explore the interactive graph (click nodes to inspect)
5. Review the **Fraud Ring Summary Table** and **Top Suspicious Accounts**
6. Click **"Download JSON"** for the machine-readable output file

### CSV Format
```csv
transaction_id,sender_id,receiver_id,amount,timestamp
TXN_000001,ACC_01000,ACC_01001,1234.56,2024-01-15 09:30:00
```

---

## Folder Structure

```
rift/
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── requirements.txt
│   ├── routers/
│   │   └── analyze.py          # POST /api/analyze
│   ├── graph/
│   │   ├── builder.py          # CSV → DiGraph
│   │   ├── cycle_detector.py   # Johnson's algorithm
│   │   ├── smurfing_detector.py# Fan-in/fan-out + temporal analysis
│   │   ├── shell_detector.py   # DFS shell chain detection
│   │   ├── scorer.py           # Suspicion scoring
│   │   └── pipeline.py         # Full analysis orchestration
│   └── models/
│       └── schemas.py          # Pydantic response models
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── Navbar.jsx
│       │   ├── GraphView.jsx       # Cytoscape.js visualization
│       │   ├── StatsCards.jsx
│       │   ├── RingTable.jsx
│       │   └── NodeDetailPanel.jsx
│       └── pages/
│           ├── UploadPage.jsx
│           └── ResultsPage.jsx
├── notebooks/
│   ├── generate_data.ipynb     # Jupyter notebook
│   └── generate_data.py        # Standalone script
├── data/
│   ├── sample_transactions.csv # Generated sample (2440 rows)
│   └── ground_truth.json       # Ground truth for evaluation
└── README.md
```

---

## Known Limitations

- **Cycle detection on dense graphs**: Johnson's algorithm can be slow on very dense graphs (>5K nodes, >50K edges). A practical cutoff is applied to skip graphs where estimated cycle count is prohibitively large.
- **Temporal smurfing window**: Uses a simplified sliding window; a proper time-series approach would be more accurate.
- **Shell detection depth**: DFS capped at depth 5 to bound computation time.
- **No ML model**: Detection is purely rule-based graph analytics; adding GNN-based scoring would improve recall.
- **Single file upload**: Multi-file / streaming ingestion not supported.

---

## Team Members

> *(Add your team members here)*

---

*RIFT 2026 · Graph Theory / Financial Crime Detection Track*
