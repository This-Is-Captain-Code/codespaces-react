#!/bin/bash
set -e

echo "🚀 MoltRack v0 - Complete Setup & Startup"
echo "==========================================="
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

echo "✅ Docker found"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js found ($(node --version))"
echo ""

# Step 1: Create storage directory
echo "📁 Creating persistent storage directory..."
mkdir -p /var/moltrack/agents
chmod 777 /var/moltrack/agents
echo "✅ Storage ready at /var/moltrack/agents"
echo ""

# Step 2: Backend setup
echo "📦 Setting up backend..."
cd /workspaces/codespaces-react/backend

if [ ! -d "node_modules" ]; then
    echo "   Installing dependencies..."
    npm install --legacy-peer-deps
else
    echo "   Dependencies already installed"
fi

if [ ! -f ".env" ]; then
    echo "   Creating .env file..."
    cat > .env << 'EOF'
# OpenRouter API Configuration
OPENROUTER_API_KEY=your_openrouter_key_here

# Backend Configuration
BACKEND_URL=http://localhost:3001
PORT=3001

# Agent Storage Path
AGENTS_PATH=/var/moltrack/agents

# Auth Token (development)
AUTH_TOKEN=dev-user-123

# LLM Model Selection
LLM_MODEL=gpt-3.5-turbo
EOF
    echo "   ⚠️  .env created - please add your OPENROUTER_API_KEY"
else
    echo "   .env file already exists"
fi

echo "✅ Backend ready"
echo ""

# Step 3: Frontend setup
echo "📦 Setting up frontend..."
cd /workspaces/codespaces-react

if [ ! -d "node_modules" ]; then
    echo "   Installing dependencies..."
    npm install --legacy-peer-deps
else
    echo "   Dependencies already installed"
fi

echo "✅ Frontend ready"
echo ""

# Step 4: Docker image
echo "🐳 Checking OpenClaw Docker image..."
if docker images | grep -q openclaw; then
    echo "✅ OpenClaw image already available"
else
    echo "   Pulling openclaw:latest..."
    docker pull openclaw:latest || echo "⚠️  Could not pull - will try on first agent start"
fi
echo ""

echo "═══════════════════════════════════════════════════════"
echo "✅ Setup complete!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "📝 TODO: Add your OpenRouter API key to:"
echo "   /workspaces/codespaces-react/backend/.env"
echo ""
echo "🚀 To start the system, run in separate terminals:"
echo ""
echo "   Terminal 1 (Backend):"
echo "   cd /workspaces/codespaces-react/backend && npm run dev"
echo ""
echo "   Terminal 2 (Frontend):"
echo "   cd /workspaces/codespaces-react && npm run dev"
echo ""
echo "🌐 Then open: http://localhost:5173"
echo ""
echo "📖 Full guide: see /workspaces/codespaces-react/QUICKSTART.md"
