# Molt.town

## Overview
Molt.town is an automated AI agent launch platform designed to quickly deploy AI agents with integrated wallets and tradeable tokens. It enables users to create a dedicated AI agent in approximately 30 seconds, complete with its own Fly.io instance, server-side Privy wallet, and a custom ERC-20 token on any EVM chain with dynamic fee management via a Uniswap v4 Hook. The platform also registers the agent's identity on-chain via ERC-8004 and installs autonomous skills (erc-8004 + molt-fees). The vision is to provide a dedicated, isolated AI agent environment for each user, fostering autonomous trading and on-chain identity for AI.

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

## System Architecture
Molt.town utilizes a per-user dedicated instance model. Each user's AI agent is deployed on its own OpenClaw gateway hosted on Fly.io, ensuring complete isolation. A server-side Privy wallet is provisioned for each agent, alongside a custom ERC-20 token deployable on any supported EVM chain (Base, Ethereum, Arbitrum, Optimism, Polygon). The frontend is built with React 18 and Vite, communicating with an Express.js backend. PostgreSQL is used for data persistence. Deployment of OpenClaw gateways is managed via the Fly.io Machines API. AI model access is handled through the OpenRouter API, with a provisioning system that assigns per-user API keys and spending limits. The system supports dual-mode authentication via Privy (for X/Twitter, Google, email login) or a fallback username-based system. Agents are equipped with skills including `erc-8004` for on-chain identity registration and `molt-fees` for dynamic fee management. OpenClaw gateways are configured to run with specific Docker images and commands, injecting configuration via base64-encoded environment variables and persisting agent data on Fly.io volumes.

## External Dependencies
- **Privy**: For user authentication (X/Twitter, Google, Email) and server-side wallet creation.
- **Fly.io**: For deploying and managing dedicated OpenClaw gateway instances via its Machines API.
- **OpenRouter API**: For providing access to various AI models and managing per-user API keys and spending limits.
- **viem**: For EVM chain interaction, token deployment, and wallet management across multiple chains.
- **ERC-8004**: For on-chain AI agent identity registration on Ethereum mainnet.
- **Uniswap v4**: MoltFeeRouter Hook for dynamic, AI-agent-controlled fee distribution.

## Token Deployment
Tokens are deployed as standard ERC-20 contracts via `tokenDeployService.js`. The deploy chain is configurable via the `DEPLOY_CHAIN` environment variable.

Supported chains: `base`, `ethereum`, `arbitrum`, `optimism`, `polygon`

## Testnet Mode
Set `USE_TESTNET=true` to run the entire platform in testnet mode:
- **Token Deploy**: Uses testnet chain (e.g., Base Sepolia for `base`)
- **ERC-8004**: Uses Sepolia instead of Ethereum mainnet for identity registration. Requires `ADMIN_WALLET_PRIVATE_KEY` with Sepolia ETH.
- **Uniswap v4 Hook**: Makes real RPC calls to testnet PoolManager contracts. Requires deployed `MOLT_FEE_ROUTER_ADDRESS` on testnet for pool operations - reports "not deployed" if missing.
- **Cross-Chain Liquidity**: Calls real LI.FI API (bridges unavailable on testnets), real DB writes, real testnet RPC. No mock data.
- **Wallet**: Requires testnet funds for transaction signing

To switch to mainnet, set `USE_TESTNET=false` (or remove the variable).

### Healthcheck Endpoints
- Test all integrations: `GET /api/healthcheck/integrations`
- Generate a new wallet: `GET /api/healthcheck/generate-wallet`

## Environment Variables
Required:
- `FLY_API_TOKEN` - Fly.io API token for gateway management
- `OPENROUTER_API_KEY` - OpenRouter API key for AI models
- `PRIVY_APP_SECRET` - Privy secret for server-side wallet creation
- `ADMIN_WALLET_PRIVATE_KEY` - For signing on-chain transactions

Optional:
- `USE_TESTNET` - Set to `true` for testnet mode
- `DEPLOY_CHAIN` - Target chain for token deployment (default: `base`). Options: `base`, `ethereum`, `arbitrum`, `optimism`, `polygon`
- `MOLT_REWARD_ADDRESS` - Platform reward wallet address (required for mainnet)
- `DEV_REWARD_ADDRESS` - Default developer reward address
- `VITE_PRIVY_APP_ID` - Privy App ID for X/Twitter login
- `ADMIN_TOKEN` - Token for admin dashboard access
- `MOLT_FEE_ROUTER_ADDRESS` - Deployed MoltFeeRouter Hook contract address (required for Uniswap v4 fee management on mainnet)

## Uniswap v4 Hook Integration (MoltFeeRouter)
The platform integrates a custom Uniswap v4 Hook contract (`MoltFeeRouter.sol`) that provides dynamic, AI-agent-controlled fee distribution for token pools.

### Key Files
- `contracts/src/MoltFeeRouter.sol` - Solidity Hook contract
- `contracts/abi/MoltFeeRouter.json` - Contract ABI
- `backend/src/services/uniswapV4Service.js` - Backend service for Hook interaction
- `backend/src/services/tokenDeployService.js` - Chain-agnostic ERC-20 token deployment
- `backend/src/routes/fees.js` - Fee management API routes
- `src/components/FeeAnalytics.jsx` - Frontend fee dashboard component
- `backend/src/skills/molt-fees/SKILL.md` - Agent skill for fee management

### Architecture
- Hook uses `beforeSwap` for dynamic fee calculation and `afterSwap` for fee routing
- Volume-tiered base fees: 1% (low), 0.5% (medium), 0.25% (high volume)
- Three fee modes: conservative, balanced, aggressive (agent-controlled)
- Graduated creator fee share over token lifecycle (early/growth/mature phases)
- Four-way fee split: Agent Treasury, Developer, Platform, Admin
- Pool registration happens during agent launch (`registering_fee_hook` step)

### API Endpoints
- `GET /api/fees/info` - Hook configuration status
- `GET /api/fees/analytics/:tokenAddress` - Pool fee analytics
- `POST /api/fees/set-mode` - Change fee mode (conservative/balanced/aggressive)
- `POST /api/fees/set-agent-share` - Adjust agent share (200-5000 BPS)
- `GET /api/fees/agent/:botId` - Agent-specific fee analytics

### Contract Addresses
- Uniswap v4 PoolManager (Base mainnet): `0x498581ff718922c3f8e6a244956af099b2652b2b`
- Uniswap v4 PoolManager (Base Sepolia): `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`
- Uniswap v4 PoolManager (Arbitrum mainnet): `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32`
- Uniswap v4 PoolManager (Arbitrum Sepolia): `0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317`

## Cross-Chain Liquidity Management

### Architecture (4-Layer Pipeline)
The platform includes a 4-layer cross-chain liquidity management system that enables agents to autonomously move and deploy capital across chains:

1. **OpenClaw (Decision Layer)** - Agent observes market conditions and decides when/how to move liquidity
2. **Yellow Network (Intent Buffering)** - ClearSync state channels batch intents off-chain before execution
3. **LI.FI (Cross-Chain Movement)** - Aggregates bridges/DEXs for optimal cross-chain token transfers
4. **Uniswap v4 (Liquidity Deployment)** - Deploys liquidity into pools with MoltFeeRouter Hook

Primary chain: Arbitrum One (Uniswap v4 native), Source chain: Base (cheap transactions)

### Key Files
- `backend/src/services/intentService.js` - Intent CRUD (create, list, update, observe)
- `backend/src/services/yellowNetworkService.js` - ClearSync state channel buffering/batching
- `backend/src/services/lifiService.js` - LI.FI cross-chain quote/execution
- `backend/src/services/uniswapV4Service.js` - Uniswap v4 liquidity deployment (multi-chain)
- `backend/src/routes/liquidity.js` - Liquidity API routes
- `backend/src/skills/liquidity-manager/SKILL.md` - Agent skill for autonomous liquidity ops
- `src/components/LiquidityDashboard.jsx` - Frontend liquidity management dashboard

### Database Tables
- `liquidity_intents` - Tracks intent lifecycle (pending → buffered → executing → completed)
- `liquidity_positions` - Active liquidity positions on destination chains
- `cross_chain_movements` - Cross-chain transfer tracking (bridge, amounts, fees)

### API Endpoints
- `GET /api/liquidity/status` - Layer configuration and health status
- `GET /api/liquidity/observe` - Pool state, buffer status, recent intents, positions
- `GET /api/liquidity/analytics` - Aggregate analytics (intent counts, positions, movements)
- `POST /api/liquidity/intents` - Create a new liquidity intent
- `GET /api/liquidity/intents` - List intents (filterable by status, botId)
- `GET /api/liquidity/intents/:id` - Get specific intent details
- `POST /api/liquidity/execute-pipeline` - Full pipeline execution (buffer → move → deploy)
- `POST /api/liquidity/quote` - Get LI.FI cross-chain quote
- `POST /api/liquidity/execute-move` - Execute cross-chain movement via LI.FI
- `POST /api/liquidity/deploy` - Deploy liquidity into Uniswap v4 pool

### Testnet Mode
When `USE_TESTNET=true`, all services use real testnet chains and APIs:
- Yellow Network: Local intent batching with real DB writes (ClearSync has no public testnet)
- LI.FI: Calls real LI.FI API with testnet chain IDs (Base Sepolia 84532, Arbitrum Sepolia 421614). Bridges are typically unavailable between testnets - handled gracefully with `bridgeLimited` flag
- Uniswap v4: Makes real RPC calls to testnet PoolManager contracts. Requires `MOLT_FEE_ROUTER_ADDRESS` deployed on testnet and `ADMIN_WALLET_PRIVATE_KEY` with testnet funds for write operations
- No fake/mock data - services report actual capabilities and fail gracefully when testnet infrastructure doesn't support an operation

### Agent Skill: liquidity-manager
Installed during agent launch alongside erc-8004 and molt-fees skills. Provides 11 tools:
- Observation: `observe_pool`, `check_buffer`, `get_analytics`
- Intent Management: `create_intent`, `list_intents`
- Execution: `get_quote`, `execute_move`, `deploy_liquidity`, `execute_pipeline`
- Position Management: `list_positions`, `rebalance_position`
