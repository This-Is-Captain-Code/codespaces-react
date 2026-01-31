# MoltRack v0

## Overview
MoltRack v0 is a persistent OpenClaw Agent Runtime application. Users sign up, create AI bots that deploy to Railway as OpenClaw instances, and receive tokens to interact with their bots.

**Model**: 1 user → 1 bot → 1 token

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
- **Deployment**: Railway API for OpenClaw deployment
- **AI**: OpenRouter API for model access

## Running the Application
- **Frontend**: Runs on port 5000 (Vite dev server)
- **Backend**: Runs on port 3001 (Express server)
- The Vite config proxies API requests from the frontend to the backend

## User Flow
1. User enters username → logs in
2. User fills bot creation form (name, system prompt, model)
3. Bot is deployed to Railway as OpenClaw instance
4. User receives:
   - Bot endpoint URL
   - Setup URL with password
   - OpenClaw control panel URL
   - One-time access token

## Authentication
Simple username-based login (stored in localStorage). Privy with X/Twitter login can be added later by providing VITE_PRIVY_APP_ID.

## Key Endpoints
- `POST /api/bots/create` - Create and deploy bot to Railway
- `GET /api/bots/me` - Get user's bot info
- `GET /api/bots/status` - Check bot deployment status
- `PUT /api/bots/update` - Update bot config
- `POST /api/bots/regenerate-token` - Get new token
- `DELETE /api/bots/delete` - Delete bot and Railway service

## Database Schema
- **users**: id, email, auth_token, created_at
- **bots**: id, user_id, bot_name, railway_service_id, endpoint, setup_password, token_hash, model, system_prompt, status
- **bot_tokens**: id, bot_id, token, created_at, expires_at, is_active

## Environment Variables
Required:
- `RAILWAY_API_TOKEN` - Railway API token
- `RAILWAY_PROJECT_ID` - Railway project ID
- `RAILWAY_ENVIRONMENT_ID` - Railway environment ID
- `OPENROUTER_API_KEY` - OpenRouter API key for AI models

Optional:
- `VITE_PRIVY_APP_ID` - Privy App ID for X/Twitter login

## Railway Deployment Flow
When a bot is created:
1. Create Railway service with OpenClaw Docker image
2. Set environment variables (PORT, SETUP_PASSWORD, OpenRouter config)
3. Create volume at /data for persistent storage
4. Create public domain
5. Trigger deployment
6. Wait for deployment to be ready

## Bot Status Values
- **demo_mode**: Railway credentials not configured
- **creating**: Deployment in progress
- **running**: Successfully deployed
- **error**: Deployment failed

## OpenClaw URLs
After deployment, users get:
- `/setup` - Configuration wizard (password protected)
- `/openclaw` - Control panel for managing integrations (Telegram, Discord, etc.)

## Recent Changes
- 2026-01-31: Railway OpenClaw deployment
  - Deploy OpenClaw instances to Railway via GraphQL API
  - Volume at /data for persistent storage
  - Setup password and control panel access
- 2026-01-31: Token system
  - One-time token display on creation
  - Secure token generation and hashing
- 2026-01-31: Simplified authentication
  - Username-based login (Privy optional)
- 2026-01-31: Initial setup
  - PostgreSQL database
  - Backend API with bot CRUD
  - Frontend dashboard
