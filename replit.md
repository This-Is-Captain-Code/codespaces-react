# Molt.town

## Overview
Molt.town is an automated AI agent launch platform designed to quickly deploy AI agents with integrated wallets and tradeable tokens. It enables users to create a dedicated AI agent in approximately 30 seconds, complete with its own Fly.io instance, server-side Privy wallet, and a custom Clanker token on Base with fee splits. The platform also registers the agent's identity on-chain via ERC-8004 and installs autonomous trading skills (bankr + erc-8004). The vision is to provide a dedicated, isolated AI agent environment for each user, fostering autonomous trading and on-chain identity for AI.

## User Preferences
Not specified.

## System Architecture
Molt.town utilizes a per-user dedicated instance model. Each user's AI agent is deployed on its own OpenClaw gateway hosted on Fly.io, ensuring complete isolation. A server-side Privy wallet is provisioned for each agent, alongside a unique Clanker token. The frontend is built with React 18 and Vite, communicating with an Express.js backend. PostgreSQL is used for data persistence. Deployment of OpenClaw gateways is managed via the Fly.io Machines API. AI model access is handled through the OpenRouter API, with a provisioning system that assigns per-user API keys and spending limits. The system supports dual-mode authentication via Privy (for X/Twitter, Google, email login) or a fallback username-based system. Agents are equipped with skills installed from the BankrBot/openclaw-skills GitHub repository, including `bankr` for crypto trading and `erc-8004` for on-chain identity registration. OpenClaw gateways are configured to run with specific Docker images and commands, injecting configuration via base64-encoded environment variables and persisting agent data on Fly.io volumes.

## External Dependencies
- **Privy**: For user authentication (X/Twitter, Google, Email) and server-side wallet creation.
- **Fly.io**: For deploying and managing dedicated OpenClaw gateway instances via its Machines API.
- **OpenRouter API**: For providing access to various AI models and managing per-user API keys and spending limits.
- **Clanker SDK**: For deploying custom tokens on the Base network.
- **ERC-8004**: For on-chain AI agent identity registration on Ethereum mainnet.
- **BankrBot/openclaw-skills GitHub repository**: Source for agent skills like `bankr` (crypto trading) and `erc-8004` (on-chain identity).