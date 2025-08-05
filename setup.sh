#!/bin/bash

# Simple MCP Client Setup Script
# This script sets up both the backend and frontend for the Simple MCP Client

set -e  # Exit on any error

echo "🤖 Simple MCP Client Setup"
echo "=========================="

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    OS="windows"
fi

echo "Detected OS: $OS"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Python
if ! command_exists python3; then
    echo "❌ Python 3 is required but not installed."
    echo "Please install Python 3.8+ and try again."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo "✅ Python $PYTHON_VERSION found"

# Check Node.js
if ! command_exists node; then
    echo "❌ Node.js is required but not installed."
    echo "Please install Node.js 16+ and try again."
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js $NODE_VERSION found"

# Check npm
if ! command_exists npm; then
    echo "❌ npm is required but not installed."
    echo "Please install npm and try again."
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "✅ npm $NPM_VERSION found"

echo ""

# Backend setup
echo "🐍 Setting up Backend..."
echo "------------------------"

cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
else
    echo "✅ Virtual environment already exists"
fi

# Activate virtual environment
echo "Activating virtual environment..."
if [[ "$OS" == "windows" ]]; then
    source venv/Scripts/activate
else
    source venv/bin/activate
fi
echo "✅ Virtual environment activated"

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip
echo "✅ pip upgraded"

# Install requirements
if [ -f "requirements.txt" ]; then
    echo "Installing Python dependencies..."
    pip install -r requirements.txt
    echo "✅ Python dependencies installed"
else
    echo "❌ requirements.txt not found in backend directory"
    exit 1
fi

# Create logs directory if it doesn't exist
if [ ! -d "logs" ]; then
    mkdir logs
    echo "✅ Logs directory created"
fi

# Create database if it doesn't exist
echo "Initializing database..."
python -c "from app.core.database import Database; db = Database(); print('✅ Database initialized')"

cd ..

echo ""

# Frontend setup
echo "⚛️  Setting up Frontend..."
echo "-------------------------"

cd frontend

# Install dependencies
echo "Installing Node.js dependencies..."
npm install
echo "✅ Node.js dependencies installed"

cd ..

echo ""

# Final setup
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "Your Simple MCP Client is now ready to use!"
echo ""
echo "To start the application:"
echo ""
echo "1. Start the backend (in one terminal):"
echo "   cd backend"
if [[ "$OS" == "windows" ]]; then
    echo "   venv\\Scripts\\activate"
else
    echo "   source venv/bin/activate"
fi
echo "   python main.py"
echo ""
echo "2. Start the frontend (in another terminal):"
echo "   cd frontend"
echo "   npm run dev"
echo ""
echo "3. Open your browser to http://localhost:5173"
echo ""
echo "📝 Next steps:"
echo "- Configure an LLM provider in Settings"
echo "- Add MCP servers in Settings"
echo "- Start chatting with your AI assistant!"
echo ""
echo "For more information, see the README.md file."