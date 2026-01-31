#!/bin/bash
set -e

echo "🔧 Installing backend dependencies..."
cd /workspaces/codespaces-react/backend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    npm install
else
    # Install any missing packages
    npm install --no-save
fi

echo "✅ Dependencies installed"
echo "🚀 Starting backend..."
npm run dev
