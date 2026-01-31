# MoltRack v0

## Overview
MoltRack v0 is a persistent OpenClaw Agent Runtime application. Users sign up, create AI bots that are deployed as agents on shared OpenClaw gateway instances running on Fly.io.

**Model**: 1 user → 1 bot → 1 token

**Architecture**: Shared gateway model - multiple user agents run on shared OpenClaw gateway instances for cost efficiency (~$0.50/user vs $62/user for per-user containers).

## Project Structure
- `/` - Frontend (React + Vite)
- `/backend` - Backend (Express.js API server)
- `/src` - Frontend React source files
- `/src/components` - React UI components (BotDashboard)
- `/src/api` - API client for backend communication
- `/backend/src` - Backend source files
- `/backend/src/routes` - API route handlers
- `/backend/src/services` - Business logic (botService, flyService, gatewayService, userService)
- `/backend/src/db` - Database connection and schema
- `/backend/src/middleware` - Auth middleware

## Tech Stack
- **Frontend**: React 18, Vite, Axios
- **Backend**: Express.js, Node.js, PostgreSQL
- **Database**: PostgreSQL (Replit built-in)
- **Deployment**: Fly.io Machines API for OpenClaw gateway deployment
- **AI**: OpenRouter API for model access

## Running the Application
- **Frontend**: Runs on port 5000 (Vite dev server)
- **Backend**: Runs on port 3001 (Express server)
- The Vite config proxies API requests from the frontend to the backend

## User Flow
1. User enters username → logs in
2. User fills bot creation form (name, system prompt, model)
3. Agent is created on shared OpenClaw gateway
4. User receives:
   - Bot endpoint URL
   - Gateway token for authentication
   - OpenClaw control panel URL

## Authentication
Dual-mode authentication system:
- **Privy mode** (active when `VITE_PRIVY_APP_ID` is set): Email, Twitter, and Google login via Privy SDK
- **Fallback mode**: Simple username-based login (stored in localStorage)

Backend verifies Privy JWT tokens using `@privy-io/node` SDK when `PRIVY_APP_SECRET` is configured.

## Key Endpoints
- `POST /api/bots/create` - Create and deploy bot agent
- `GET /api/bots/me` - Get user's bot info
- `GET /api/bots/status` - Check bot deployment status
- `PUT /api/bots/update` - Update bot config
- `POST /api/bots/regenerate-token` - Get new token
- `DELETE /api/bots/delete` - Delete bot agent
- `POST /api/chat/message` - Send message to bot via gateway tools/invoke API
- `GET /api/chat/history` - Get chat history (via gateway)

## Database Schema
- **users**: id, email, auth_token, created_at
- **gateways**: id, fly_app_name, fly_machine_id, fly_volume_id, endpoint, gateway_token, region, memory_mb, max_agents, current_agents, status
- **bots**: id, user_id, bot_name, gateway_id, agent_id, endpoint, token_hash, model, system_prompt, status

## Environment Variables
Required:
- `FLY_API_TOKEN` - Fly.io API token for gateway management
- `OPENROUTER_API_KEY` - OpenRouter API key for AI models

Optional:
- `VITE_PRIVY_APP_ID` - Privy App ID for X/Twitter login

## Fly.io Gateway Deployment
Shared OpenClaw gateways are deployed on Fly.io:
- Image: `ghcr.io/openclaw/openclaw:latest`
- Command: `node dist/index.js gateway --allow-unconfigured --port 3000 --bind lan`
- Port: 3000 (internal), exposed via HTTPS on fly.dev domain
- Volume: 1GB at /data for persistent state
- Memory: 2GB RAM, 2 shared CPUs
- Each gateway can host ~200 agents

## Gateway Status Values
- **creating**: Gateway deployment in progress
- **running**: Gateway successfully deployed
- **error**: Deployment failed

## Bot Status Values
- **demo_mode**: Gateway not configured
- **creating**: Agent creation in progress
- **running**: Agent successfully created
- **error**: Agent creation failed

## Current Gateway
- **Main Gateway**: https://openclaw-gw-main.fly.dev
- **Region**: iad (Virginia)
- **Machine ID**: 48e254dc265428
- **Capacity**: 200 agents

## OpenClaw Access
After agent creation, users access:
- Control UI at gateway endpoint with token: `https://gateway.fly.dev/?token=TOKEN`

## Chat Architecture
The chat system uses a hybrid approach:
- **OpenRouter**: Handles AI model inference using the bot's configured model and system prompt
- **OpenClaw Gateway**: Provides persistent agent infrastructure on Fly.io (for future tool/skill expansion)

This architecture gives users a one-click bot creation experience while keeping costs low ($0.50/user vs $62/user for full per-user containers).

## Recent Changes
- 2026-01-31: Chat via OpenRouter
  - Chat messages go through OpenRouter using bot's model (e.g., openai/gpt-4o)
  - Bot's system prompt is applied to each conversation
  - OpenClaw gateway on Fly.io provides persistent infrastructure
- 2026-01-31: Fly.io OpenClaw deployment (following official docs)
  - Deploy OpenClaw gateways to Fly.io via Machines API
  - Use `--allow-unconfigured --port 3000 --bind lan` for headless startup
  - Allocate IPv4/IPv6 addresses for public access
  - Volume at /data for persistent storage
- 2026-01-31: Shared gateway architecture
  - Single gateway hosts multiple user agents for cost efficiency
  - Gateway service tracks agent capacity
- 2026-01-31: Pivot from Railway to Fly.io
  - Railway designed for managed apps, not programmatic infrastructure
  - Fly.io Machines API enables direct machine management
- 2026-01-31: Token system
  - Gateway token for authentication
  - Secure token generation
- 2026-01-31: Initial setup
  - PostgreSQL database
  - Backend API with bot CRUD
  - Frontend dashboard
