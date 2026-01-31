#!/bin/bash

echo "🔧 Setting up MoltRack Docker environment..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✅ Docker is available"

# Install dockerode package
echo "📦 Installing dockerode package..."
cd /workspaces/codespaces-react/backend
npm install dockerode --save --legacy-peer-deps

# Create persistent storage directory
echo "📁 Creating persistent storage directory..."
sudo mkdir -p /var/moltrack/agents
sudo chmod 777 /var/moltrack/agents

# Pull openclaw image
echo "🐳 Pulling OpenClaw image..."
docker pull openclaw:latest || echo "⚠️  Could not pull openclaw:latest - will attempt when starting agent"

# Create .env file if it doesn't exist
if [ ! -f /workspaces/codespaces-react/backend/.env ]; then
    echo "📝 Creating .env file..."
    cat > /workspaces/codespaces-react/backend/.env << 'EOF'
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
    echo "✅ Created .env file - please add your OPENROUTER_API_KEY"
fi

echo "✅ Setup complete! You can now:"
echo "   1. cd /workspaces/codespaces-react/backend"
echo "   2. npm run dev"
echo ""
echo "In another terminal:"
echo "   1. cd /workspaces/codespaces-react"
echo "   2. npm run dev"
