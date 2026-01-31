# MoltRack v0

## Overview
MoltRack v0 is a persistent OpenClaw Agent Runtime application. It's a full-stack React + Express application that allows users to create and manage AI agents, chat with them using various LLM models through OpenRouter, and manage billing/credits.

## Project Structure
- `/` - Frontend (React + Vite)
- `/backend` - Backend (Express.js API server)
- `/src` - Frontend React source files
- `/src/components` - React UI components
- `/src/api` - API client for backend communication
- `/backend/src` - Backend source files
- `/backend/src/routes` - API route handlers
- `/backend/src/services` - Business logic services

## Tech Stack
- **Frontend**: React 18, Vite, Axios
- **Backend**: Express.js, Node.js
- **API Proxy**: Vite dev server proxies `/api` requests to backend

## Running the Application
- **Frontend**: Runs on port 5000 (Vite dev server)
- **Backend**: Runs on port 3001 (Express server)
- The Vite config proxies API requests from the frontend to the backend

## Key Endpoints
- `GET /api/agents` - Get all agents for user
- `POST /api/agents` - Create a new agent
- `GET /api/billing/balance` - Get user credits
- `POST /api/chat/:agentId/message` - Send message to agent

## Environment Variables
The backend expects an `.env` file in the `/backend` directory with:
- `OPENROUTER_API_KEY` - API key for OpenRouter (required for chat functionality)

## Recent Changes
- 2026-01-31: Configured for Replit environment
  - Updated Vite config for port 5000 with allowedHosts
  - Set up API proxy to forward requests to backend
  - Updated frontend API client to use relative `/api` paths
  - Added missing routes (agents, billing) to backend
