# Molt.town

## Overview
Molt.town is an automated AI agent launch platform that enables rapid deployment of dedicated AI agents. Each agent comes with an integrated server-side Privy wallet and a custom ERC-20 token on any EVM chain, featuring dynamic fee management via a Uniswap v4 Hook. The platform aims to provide isolated AI agent environments, fostering autonomous trading and on-chain identity for AI through ERC-8004 registration and autonomous skills. The vision is to empower AI with dedicated resources and on-chain financial capabilities.

## User Preferences
- Clean dark crypto-native design (near-black background #09090b)
- Subtle dot grid pattern background (no starfield or animations)
- Orange accent color (#ff4d00) matching Moltbook/lobster ecosystem
- Green (#00ff6a) for success states and live indicators
- Inter font (primary) with Space Grotesk as fallback
- Lobster emoji in logo (matching Moltbook brand)
- Minimal, confident design - no gradients or particles
- Telegram integration should be configured upfront during agent launch
- Twitter integration planned for future (currently disabled with "Coming Soon" badge)
- Multi-chain token deployment (not locked to Base/Clanker)
- All on-chain transaction hashes must be visible in the frontend with explorer links

## System Architecture
Molt.town employs a per-user dedicated instance model, deploying each AI agent on its own OpenClaw gateway hosted on Fly.io for isolation. A server-side Privy wallet is provisioned per agent, along with a custom ERC-20 token deployable on various EVM chains (Base, Ethereum, Arbitrum, Optimism, Polygon). The frontend is built with React 18 and Vite, interacting with an Express.js backend. PostgreSQL handles data persistence. OpenClaw gateway deployment is managed via the Fly.io Machines API. AI model access is facilitated through the OpenRouter API, which provisions per-user API keys and spending limits. Authentication supports dual-mode operation: Privy (for X/Twitter, Google, email) or a username-based fallback. Agents are equipped with `erc-8004` for on-chain identity and `molt-fees` for dynamic fee management. The system also includes a 4-layer cross-chain liquidity management pipeline: OpenClaw (decision), Yellow Network (intent buffering), LI.FI (cross-chain movement), and Uniswap v4 (liquidity deployment with MoltFeeRouter Hook).

## External Dependencies
- **Privy**: User authentication and server-side wallet creation.
- **Fly.io**: Deployment and management of dedicated OpenClaw gateway instances.
- **OpenRouter API**: Access to various AI models and API key/spending limit management.
- **viem**: EVM chain interaction, token deployment, and wallet management.
- **ERC-8004**: On-chain AI agent identity registration.
- **Uniswap v4**: Custom MoltFeeRouter Hook for dynamic, AI-agent-controlled fee distribution.
- **Yellow Network (Nitrolite SDK)**: ERC-7824 state channel integration for cross-chain intent buffering.
- **LI.FI**: Aggregates bridges and DEXs for optimal cross-chain token transfers.