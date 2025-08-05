#!/bin/bash

# Simple MCP Chat Client - Development Start Script
# This script starts both backend and frontend servers with logging

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create logs directory
mkdir -p logs

# Function to cleanup background processes
cleanup() {
    echo -e "\n${YELLOW}Stopping servers...${NC}"
    if [ -f logs/backend.pid ]; then
        PID=$(cat logs/backend.pid)
        if kill -0 $PID 2>/dev/null; then
            kill $PID
            echo -e "${GREEN}Backend server stopped${NC}"
        fi
        rm -f logs/backend.pid
    fi
    
    if [ -f logs/frontend.pid ]; then
        PID=$(cat logs/frontend.pid)
        if kill -0 $PID 2>/dev/null; then
            kill $PID
            echo -e "${GREEN}Frontend server stopped${NC}"
        fi
        rm -f logs/frontend.pid
    fi
    
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo -e "${BLUE}Simple MCP Chat Client - Development Environment${NC}"
echo -e "${BLUE}=============================================${NC}"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 is not installed or not in PATH${NC}"
    exit 1
fi

# Check if Node.js is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed or not in PATH${NC}"
    exit 1
fi

# Start Backend Server
echo -e "${YELLOW}Starting backend server...${NC}"
cd backend
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8002 > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../logs/backend.pid
cd ..

# Wait a moment for backend to start
sleep 2

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}Failed to start backend server. Check logs/backend.log${NC}"
    exit 1
fi

echo -e "${GREEN}Backend server started (PID: $BACKEND_PID)${NC}"
echo -e "  URL: http://localhost:8002"
echo -e "  Logs: logs/backend.log"

# Start Frontend Server
echo -e "${YELLOW}Starting frontend server...${NC}"
cd frontend
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../logs/frontend.pid
cd ..

# Wait a moment for frontend to start
sleep 3

# Check if frontend started successfully
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}Failed to start frontend server. Check logs/frontend.log${NC}"
    cleanup
    exit 1
fi

echo -e "${GREEN}Frontend server started (PID: $FRONTEND_PID)${NC}"
echo -e "  URL: http://localhost:5173 (or next available port)"
echo -e "  Logs: logs/frontend.log"

echo ""
echo -e "${GREEN}Both servers are running!${NC}"
echo -e "${BLUE}Press Ctrl+C to stop both servers${NC}"
echo ""
echo -e "Logs are being written to:"
echo -e "  Backend:  logs/backend.log"
echo -e "  Frontend: logs/frontend.log"
echo ""
echo -e "You can monitor logs in real-time with:"
echo -e "  ${YELLOW}tail -f logs/backend.log${NC}"
echo -e "  ${YELLOW}tail -f logs/frontend.log${NC}"

# Wait indefinitely (servers run in background)
wait