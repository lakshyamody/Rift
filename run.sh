#!/bin/bash
# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
