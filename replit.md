# MoltRack v0

## Overview
MoltRack v0 is a persistent OpenClaw Agent Runtime application. Users sign up, create AI bots that can run on Railway as OpenClaw instances, and have those bots persist over time.

## Project Structure
- `/` - Frontend (React + Vite)
- `/backend` - Backend (Express.js API server)
- `/src` - Frontend React source files
- `/src/components` - React UI components (BotDashboard)
- `/src/api` - API client for backend communication
- `/backend/src` - Backend source files
- `/backend/src/routes` - API route handlers
- `/backend/src/services` - Business logic (botService, railwayService, userService)
- `/backend/src/db` - Database connection and schema
- `/backend/src/middleware` - Auth middleware

## Tech Stack
- **Frontend**: React 18, Vite, Axios
- **Backend**: Express.js, Node.js, PostgreSQL
- **Database**: PostgreSQL (Replit built-in)
- **Deployment**: Railway API for bot deployment (optional)

## Running the Application
- **Frontend**: Runs on port 5000 (Vite dev server)
- **Backend**: Runs on port 3001 (Express server)
- The Vite config proxies API requests from the frontend to the backend

## Authentication
Currently using simple username-based login (stored in localStorage). Privy with X/Twitter login can be added later by providing VITE_PRIVY_APP_ID.

## Key Endpoints
- `POST /api/bots/create` - Create a new bot
- `GET /api/bots/me` - Get user's bot
- `GET /api/bots/status` - Check bot status
- `PUT /api/bots/update` - Update bot config
- `DELETE /api/bots/delete` - Delete bot

## Database Schema
- **users**: id, email, created_at
- **bots**: id, user_id, bot_name, system_prompt, model, railway_service_id, status, endpoint, config
- **bot_tokens**: id, bot_id, token, created_at, expires_at

## Environment Variables
Required secrets:
- `RAILWAY_API_TOKEN` - Railway API token for deployments
- `RAILWAY_PROJECT_ID` - Railway project ID
- `RAILWAY_ENVIRONMENT_ID` - Railway environment ID

Optional:
- `VITE_PRIVY_APP_ID` - Privy App ID for X/Twitter login
- `OPENROUTER_API_KEY` - OpenRouter API key for AI responses
- `RAILWAY_OPENCLAW_TEMPLATE_ID` - OpenClaw template ID on Railway

## Bot Modes
- **demo_mode**: Bot created but not deployed to Railway (no Railway credentials)
- **creating**: Bot being deployed to Railway
- **running**: Bot successfully deployed and running
- **error**: Deployment failed

## Recent Changes
- 2026-01-31: Simplified authentication
  - Replaced Privy with simple username login
  - Can add Privy later with VITE_PRIVY_APP_ID
- 2026-01-31: Added bot management
  - Bot creation form with name, system prompt, model selection
  - Bot status display with demo mode notice
  - Railway integration for production deployment
- 2026-01-31: Initial setup
  - PostgreSQL database with users, bots, bot_tokens tables
  - Backend API with bot CRUD operations
  - Frontend bot dashboard
