#!/bin/bash

# Start backend in background
echo "🚀 Starting MoltRack Backend..."
cd /workspaces/codespaces-react/backend
npm run dev &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend to start
sleep 3

# Start frontend
echo "🚀 Starting MoltRack Frontend..."
cd /workspaces/codespaces-react
npm start

# Kill backend when frontend exits
kill $BACKEND_PID
