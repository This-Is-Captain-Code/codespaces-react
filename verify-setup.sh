#!/bin/bash
# MoltRack v0 - Verification & Test Script

echo "🔍 MoltRack v0 - System Verification"
echo "===================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check command
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 installed"
        return 0
    else
        echo -e "${RED}✗${NC} $1 NOT FOUND"
        return 1
    fi
}

# Function to check file
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${RED}✗${NC} $1 MISSING"
        return 1
    fi
}

# Function to check directory
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $1 missing (will be created)"
        return 1
    fi
}

echo "📋 System Requirements:"
echo ""

check_command "node"
check_command "npm"
check_command "docker"
check_command "git"

echo ""
echo "📁 Project Structure:"
echo ""

check_file "/workspaces/codespaces-react/backend/src/index.js"
check_file "/workspaces/codespaces-react/backend/src/services/agentService.js"
check_file "/workspaces/codespaces-react/backend/src/services/dockerService.js"
check_file "/workspaces/codespaces-react/backend/src/services/openclawService.js"
check_file "/workspaces/codespaces-react/backend/src/services/openrouterService.js"
check_file "/workspaces/codespaces-react/backend/src/routes/agents.js"
check_file "/workspaces/codespaces-react/backend/src/routes/chat.js"
check_file "/workspaces/codespaces-react/public/index.html"

echo ""
echo "📦 Dependencies:"
echo ""

if [ -d "/workspaces/codespaces-react/backend/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Backend dependencies installed"
    if [ -d "/workspaces/codespaces-react/backend/node_modules/dockerode" ]; then
        echo -e "${GREEN}✓${NC} dockerode package present"
    else
        echo -e "${YELLOW}⚠${NC} dockerode not yet installed - run: npm install"
    fi
else
    echo -e "${YELLOW}⚠${NC} Backend dependencies not installed - run: npm install"
fi

if [ -d "/workspaces/codespaces-react/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Frontend dependencies installed"
else
    echo -e "${YELLOW}⚠${NC} Frontend dependencies not installed - run: npm install"
fi

echo ""
echo "⚙️  Configuration:"
echo ""

if [ -f "/workspaces/codespaces-react/backend/.env" ]; then
    echo -e "${GREEN}✓${NC} .env file exists"
    if grep -q "OPENROUTER_API_KEY=" "/workspaces/codespaces-react/backend/.env"; then
        KEY=$(grep "OPENROUTER_API_KEY=" "/workspaces/codespaces-react/backend/.env" | cut -d= -f2)
        if [ "$KEY" = "your_openrouter_key_here" ] || [ -z "$KEY" ]; then
            echo -e "${YELLOW}⚠${NC} OpenRouter API key not configured"
        else
            echo -e "${GREEN}✓${NC} OpenRouter API key configured"
        fi
    fi
else
    echo -e "${RED}✗${NC} .env file missing"
fi

echo ""
echo "🐳 Docker Setup:"
echo ""

check_dir "/var/moltrack/agents"

if docker image ls | grep -q openclaw; then
    echo -e "${GREEN}✓${NC} OpenClaw image available"
else
    echo -e "${YELLOW}⚠${NC} OpenClaw image not pulled yet - will auto-pull on first agent start"
fi

echo ""
echo "🚀 Ready to Start?"
echo ""

if [ -f "/workspaces/codespaces-react/backend/.env" ]; then
    if grep -q "OPENROUTER_API_KEY=sk-or-v1" "/workspaces/codespaces-react/backend/.env"; then
        echo -e "${GREEN}✓${NC} System appears ready!"
        echo ""
        echo "Run these commands in separate terminals:"
        echo ""
        echo "  Terminal 1 (Backend):"
        echo "  cd /workspaces/codespaces-react/backend && npm run dev"
        echo ""
        echo "  Terminal 2 (Frontend):"
        echo "  cd /workspaces/codespaces-react && npm run dev"
        echo ""
        echo "Then open: http://localhost:5173"
    else
        echo -e "${YELLOW}⚠${NC} Add OpenRouter API key to .env first:"
        echo ""
        echo "  Edit: /workspaces/codespaces-react/backend/.env"
        echo "  Set: OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY_HERE"
    fi
else
    echo -e "${RED}✗${NC} .env file missing - create it with your OpenRouter API key"
fi

echo ""
echo "📚 Documentation:"
echo "  • QUICKSTART.md - Getting started guide"
echo "  • DEPLOYMENT.md - Deployment & debugging"
echo "  • IMPLEMENTATION_SUMMARY.md - Architecture overview"
echo ""
