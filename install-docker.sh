#!/bin/bash
set -e

echo "🔧 Installing dockerode..."
cd /workspaces/codespaces-react/backend

npm install dockerode

echo "✅ Dockerode installed!"
echo "📝 You need to:"
echo "   1. Have Docker running"
echo "   2. Have openclaw:latest image available (docker pull openclaw:latest)"
echo "   3. Have /var/moltrack/agents directory with proper permissions"
echo ""
echo "🚀 Backend will now use real Docker for all agent containers."
