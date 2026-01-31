#!/bin/bash

# MoltRack v0 Quick Start Script

echo "🚀 Starting MoltRack v0..."

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env and add your OPENROUTER_API_KEY"
echo "2. Run backend: cd backend && npm run dev"
echo "3. In another terminal, run frontend: npm start"
echo ""
echo "Backend: http://localhost:3001"
echo "Frontend: http://localhost:5173 or http://localhost:3000"
