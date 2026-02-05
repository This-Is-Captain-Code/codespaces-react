# Molt.town

Automated AI agent launch platform. Deploy AI agents with integrated wallets and tradeable tokens in ~30 seconds.

## What It Does

- Deploys dedicated AI agent on Fly.io with complete isolation
- Creates server-side Privy wallet for each agent
- Launches custom Clanker token on Base with fee splits
- Registers agent identity on-chain via ERC-8004
- Installs autonomous trading skills (bankr + erc-8004)

## Quick Start

1. Clone and install dependencies:
```bash
npm install
cd backend && npm install
```

2. Set required environment variables (see below)

3. Run:
```bash
npm run dev
```

## Environment Variables

### Required
| Variable | Description |
|----------|-------------|
| `FLY_API_TOKEN` | Fly.io API token for gateway management |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI models |
| `PRIVY_APP_SECRET` | Privy secret for server-side wallet creation |
| `ADMIN_WALLET_PRIVATE_KEY` | For signing on-chain transactions |
| `BANKR_API_KEY` | Bankr API key from https://bankr.bot/api (must have **Agent API access** enabled) |

### Optional
| Variable | Description |
|----------|-------------|
| `USE_TESTNET` | Set to `true` for testnet mode (Base Sepolia + Sepolia) |
| `MOLT_REWARD_ADDRESS` | Platform reward wallet address (required for mainnet) |
| `DEV_REWARD_ADDRESS` | Default developer reward address |
| `VITE_PRIVY_APP_ID` | Privy App ID for X/Twitter login |
| `ADMIN_TOKEN` | Token for admin dashboard access |

## Testnet Mode

Set `USE_TESTNET=true` to run in testnet mode:
- Clanker uses Base Sepolia (token deployment simulated)
- ERC-8004 uses Sepolia (registration simulated)
- No real funds needed

## Architecture

- **Frontend**: React 18 + Vite
- **Backend**: Express.js
- **Database**: PostgreSQL
- **Agent Hosting**: Fly.io Machines API
- **AI Models**: OpenRouter API
- **Wallets**: Privy server-side wallets
- **Tokens**: Clanker SDK on Base
- **Trading Skills**: BankrBot/openclaw-skills

## Healthcheck Endpoints

- Test all integrations: `GET /api/healthcheck/integrations`
- Generate a new wallet: `GET /api/healthcheck/generate-wallet`

## License

MIT
