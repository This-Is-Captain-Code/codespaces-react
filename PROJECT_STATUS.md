# Molt.town - Complete Project Status Dump
**Date:** February 5, 2026  
**Purpose:** Handoff document for design and architecture review

---

## 1. PROJECT STRUCTURE

### Full File/Folder Tree
```
molt.town/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   └── index.js              # PostgreSQL connection + schema
│   │   ├── middleware/
│   │   │   └── auth.js               # JWT/token auth middleware
│   │   ├── routes/
│   │   │   ├── admin.js              # Admin dashboard routes
│   │   │   ├── agents.js             # Legacy agent routes
│   │   │   ├── auth.js               # Username/password auth
│   │   │   ├── billing.js            # Billing/credits routes
│   │   │   ├── bots.js               # Bot management routes
│   │   │   ├── healthcheck.js        # Integration health checks
│   │   │   └── launch.js             # One-click agent launch routes
│   │   ├── services/
│   │   │   ├── agentLaunchService.js # Main launch orchestrator
│   │   │   ├── agentService.js       # Legacy agent service
│   │   │   ├── autoApprovalService.js# Auto-approve pending bots
│   │   │   ├── billingService.js     # Credits/billing logic
│   │   │   ├── botService.js         # Bot CRUD operations
│   │   │   ├── clankerService.js     # Clanker v4 token deployment
│   │   │   ├── dockerService.js      # Legacy Docker deployment
│   │   │   ├── erc8004Service.js     # ERC-8004 on-chain identity
│   │   │   ├── flyService.js         # Fly.io machine management
│   │   │   ├── gatewayService.js     # Gateway pool management
│   │   │   ├── openclawService.js    # OpenClaw agent API
│   │   │   ├── openrouterProvisioningService.js # Per-user API keys
│   │   │   ├── openrouterService.js  # OpenRouter API wrapper
│   │   │   ├── privyWalletService.js # Server-side wallet creation
│   │   │   ├── skillInstallerService.js # Install bankr/erc-8004 skills
│   │   │   └── userService.js        # User management
│   │   └── index.js                  # Express server entry
│   └── package.json
├── src/
│   ├── api/
│   │   └── client.js                 # API client for backend
│   ├── components/
│   │   ├── AdminDashboard.jsx/css    # Admin panel
│   │   ├── AgentDashboard.jsx/css    # Post-launch dashboard
│   │   ├── AgentForm.jsx/css         # Legacy form
│   │   ├── AgentLaunchForm.jsx/css   # One-click launch form
│   │   ├── AgentList.jsx/css         # Legacy agent list
│   │   ├── AuthForm.jsx/css          # Username/password login
│   │   ├── BillingCard.jsx/css       # Credits display
│   │   ├── BotDashboard.jsx/css      # Legacy bot dashboard
│   │   ├── PrivyApp.jsx              # Main app with Privy auth
│   │   └── PrivyLanding.css          # Landing page styles
│   ├── providers/
│   │   └── PrivyProviderWrapper.jsx  # Privy auth provider
│   ├── App.jsx                       # Legacy app entry
│   ├── App.css                       # Global styles
│   ├── index.jsx                     # React entry point
│   └── index.css                     # Root CSS variables
├── public/
│   ├── manifest.json
│   └── favicon.ico
├── index.html                        # Vite HTML template
├── vite.config.js                    # Vite config
├── package.json                      # Frontend dependencies
├── replit.md                         # Project documentation
└── PROJECT_STATUS.md                 # This file
```

### Framework/Stack
- **Frontend:** React 18 + Vite
- **Backend:** Express.js (Node.js)
- **Database:** PostgreSQL (Neon-backed, via Replit)
- **Auth:** Privy (Twitter/X, Google, Email)
- **Agent Runtime:** OpenClaw on Fly.io
- **Token Deployment:** Clanker SDK v4
- **Wallet:** Privy Server Wallets
- **AI Models:** OpenRouter API

### Key Config Files
- `vite.config.js` - Vite build config
- `package.json` - Frontend deps (React, Privy, Viem, Clanker SDK)
- `backend/package.json` - Backend deps (Express, Axios, Dockerode)
- `replit.md` - Project documentation and preferences

---

## 2. ROUTES & PAGES

### Frontend Routes (Single Page App)
| Route | Component | Auth Required | Description |
|-------|-----------|---------------|-------------|
| `/` | PrivyApp → LandingPage | No | Marketing landing page |
| `/` | PrivyApp → AgentDashboard | Yes (Privy) | Post-login dashboard |
| `/` | AgentLaunchForm | Yes | One-click launch form (inside dashboard) |

### Backend API Routes
| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/register` | POST | No | Register with email/password |
| `/api/auth/login` | POST | No | Login with email/password |
| `/api/launch/` | POST | Privy JWT | Launch new agent |
| `/api/launch/stream` | POST | Privy JWT | Launch with SSE progress |
| `/api/launch/status` | GET | Privy JWT | Get agent status |
| `/api/launch/recover-wallet` | POST | Privy JWT | Recover agent wallet |
| `/api/launch/` | DELETE | Privy JWT | Delete agent |
| `/api/bots/...` | Various | Token | Legacy bot management |
| `/api/admin/...` | Various | Admin token | Admin dashboard |
| `/api/healthcheck/integrations` | GET | No | Test all integrations |
| `/api/healthcheck/generate-wallet` | GET | No | Generate test wallet |
| `/health` | GET | No | Basic health check |

### Landing Page
The landing page (`PrivyLanding.css` + `PrivyApp.jsx`) serves:
- Hero: "Your agent deserves a token."
- Thesis section: "Agents need economic skin in the game"
- 3-step flow: Name it → Launch → Earn
- Feature cards (6 cards)
- Fee split visualization
- CTA: "gm agents"
- Footer with ecosystem links

### Dashboard (Post-Launch)
Shows when user has an agent:
- Agent name + status indicator
- Endpoint link (opens OpenClaw control panel)
- Model info
- Agent wallet address + Basescan link
- Token info: symbol, name, contract address, trade link
- ERC-8004 agent ID
- User wallet address
- Danger zone: Recover Wallet, Delete Agent

### Agent Directory/Listing
**Not implemented.** Currently each user can only have ONE agent.

---

## 3. AUTH

### Auth System
**Primary:** Privy (React SDK + Server Auth)
- Login methods: Twitter/X, Google, Email
- Configured in `PrivyProviderWrapper.jsx`
- Creates embedded wallet on login (`createOnLogin: 'users-without-wallets'`)

**Fallback:** Username/Password
- Legacy system in `authRoutes.js` + `AuthForm.jsx`
- Not actively used with Privy flow

### Twitter/X Login Status
**Working.** Privy handles OAuth flow. Configured with:
```javascript
loginMethods: ['email', 'twitter', 'google']
```

### Post-Login Flow
1. User clicks "Launch Agent" or "Launch App"
2. Privy modal opens (Twitter/Google/Email options)
3. On success, `PrivyApp` component:
   - Gets access token via `getAccessToken()`
   - Sets token in API client
   - Renders `AgentDashboard`
4. Dashboard checks `/api/launch/status`
   - If no agent → shows `AgentLaunchForm`
   - If has agent → shows agent details

---

## 4. THE ONE-CLICK FLOW

### Launch Sequence (agentLaunchService.js)
```
1. creating_openrouter_key → OpenRouter Provisioning API
2. creating_wallet         → Privy Server Wallet API
3. deploying_agent         → Fly.io Machines API
4. configuring_telegram    → OpenClaw config (if token provided)
5. installing_skills       → OpenClaw Skills API
6. registering_identity    → ERC-8004 on Ethereum/Sepolia
7. deploying_token         → Clanker SDK v4 on Base
8. finalizing              → Save to database
```

### Status of Each Step

| Step | Status | How Triggered | Code Path |
|------|--------|---------------|-----------|
| **Agent deployment to Fly.io** | ✅ WORKING | `flyService.createUserGateway()` | Creates app, volume, machine with OpenClaw image |
| **Privy wallet generation** | ✅ WORKING | `privyWalletService.createAgentWallet()` | Uses Privy Server Auth SDK |
| **Skill auto-installation** | ✅ WORKING | `skillInstallerService.installSkills()` | Calls OpenClaw `/api/skills/install` endpoint |
| **ERC-8004 registration** | ⚠️ TESTNET ONLY | `erc8004Service.registerAgent()` | Simulated on testnet, real on mainnet |
| **Clanker token deployment** | ⚠️ TESTNET ONLY | `clankerService.deployToken()` | Simulated on testnet, uses Clanker SDK on mainnet |
| **Fee split configuration** | ✅ CONFIGURED | In `clankerService.js` | See Clanker section below |

### Fee Split Configuration (clankerService.js lines 120-147)
```javascript
rewards: {
  recipients: [
    { recipient: agentTreasuryAddress, bps: 833 },   // ~0.1% → Agent treasury
    { recipient: devRewardAddress, bps: 3333 },      // ~0.4% → Developer
    { recipient: MOLT_REWARD_ADDRESS, bps: 4167 },   // ~0.5% → Molt.town
    { recipient: tokenAdminAddress, bps: 1667 },     // ~0.2% → Clanker
  ],
}
```
**Note:** BPS values use Clanker's internal calculation. Total ~1.2% per trade.

---

## 5. CLANKER INTEGRATION

### Integration Method
**Direct Clanker SDK v4** (not via Bankr)

### Code Location
`backend/src/services/clankerService.js`

### How Reward Recipients Are Configured
```javascript
const tokenConfig = {
  name,
  symbol,
  tokenAdmin: tokenAdminAddress,
  fees: FEE_CONFIGS.DynamicBasic,
  rewards: {
    recipients: [
      { recipient: agentTreasuryAddress, admin: tokenAdminAddress, bps: 833, token: 'Paired' },
      { recipient: devRewardAddress, admin: devRewardAddress, bps: 3333, token: 'Paired' },
      { recipient: MOLT_REWARD_ADDRESS, admin: MOLT_REWARD_ADDRESS, bps: 4167, token: 'Paired' },
      { recipient: tokenAdminAddress, admin: tokenAdminAddress, bps: 1667, token: 'Paired' },
    ],
  },
};
```

### Actual API Call
```javascript
const { Clanker, POOL_POSITIONS, FEE_CONFIGS } = await import('clanker-sdk/v4');
const clanker = new Clanker({ publicClient, wallet: walletClient });
const { txHash, waitForTransaction } = await clanker.deploy(tokenConfig);
const { address } = await waitForTransaction();
```

### Network Status
- **Testnet (USE_TESTNET=true):** Returns mock address, no actual deployment
- **Mainnet (USE_TESTNET=false):** Real Clanker v4 deployment on Base

**Current setting:** `USE_TESTNET=true`

---

## 6. AGENT RUNTIME

### OpenClaw Version/Config
- **Image:** `ghcr.io/openclaw/openclaw:latest`
- **Deployment:** Fly.io Machines API
- **Memory:** 2048MB default
- **CPUs:** 2 shared

### Default Model
`openai/gpt-4o` (via OpenRouter)

### Personality/System Prompt
User configures in `AgentLaunchForm`:
- Text input for system prompt
- Dropdown for model selection
- Defaults to "You are a helpful AI assistant."

### Agent Configuration Injection
Base64-encoded config passed via `OPENCLAW_CONFIG_B64` env var:
```javascript
init: {
  cmd: ['sh', '-c', 'apk add --no-cache jq curl chromium && ... && exec node dist/index.js gateway --bind lan']
}
```

### Post-Launch Customization
**Limited.** User can:
- View agent details in dashboard
- Delete and recreate agent
- Access OpenClaw control panel via endpoint URL

Cannot currently edit system prompt or model after launch without deletion.

---

## 7. DASHBOARD (POST-LAUNCH)

### Information Displayed
| Section | Data Shown |
|---------|------------|
| Agent | Name, status (running/stopped), endpoint URL, model |
| Agent Wallet | Address, Basescan link |
| Token | Symbol, name, contract address, Clanker trade link |
| ERC-8004 | Agent ID |
| Your Wallet | User's wallet address |
| Danger Zone | Recover Wallet button, Delete Agent button |

### Earnings Tracker
**Not implemented.** No revenue/earnings display yet.

### Wallet Balance
**Not displayed.** Only address shown. User must check Basescan.

### Token Price/Volume
**Not displayed.** Only Clanker trade link provided.

### Agent Control Panel Link
**Yes.** Endpoint URL links to `{endpoint}/?token={gatewayToken}` for OpenClaw control panel.

---

## 8. ENVIRONMENT VARIABLES

### Required
| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | PostgreSQL | Neon database connection |
| `FLY_API_TOKEN` | Fly.io | Machine deployment |
| `OPENROUTER_API_KEY` | OpenRouter | AI model access |
| `PRIVY_APP_SECRET` | Privy | Server wallet creation |
| `VITE_PRIVY_APP_ID` | Privy | Frontend auth |
| `ADMIN_WALLET_PRIVATE_KEY` | Clanker/ERC-8004 | Transaction signing |
| `BANKR_API_KEY` | Bankr | Trading skill |

### Optional
| Variable | Service | Description |
|----------|---------|-------------|
| `USE_TESTNET` | All | Enable testnet mode (Base Sepolia + Sepolia) |
| `MOLT_REWARD_ADDRESS` | Clanker | Platform fee recipient |
| `DEV_REWARD_ADDRESS` | Clanker | Default developer address |
| `ADMIN_TOKEN` | Backend | Admin dashboard access |
| `OPENROUTER_PROVISIONING_KEY` | OpenRouter | Per-user API key creation |
| `ERC8004_TESTNET_REGISTRY` | ERC-8004 | Testnet registry address |

### Currently Set (Shared Environment)
```
ADMIN_TOKEN=moltrock-admin-2026
USE_TESTNET=true
MOLT_REWARD_ADDRESS=0x3A0C26b2c37e6C98e959ceace8a7be819f219E71
```

---

## 9. WHAT'S BROKEN OR INCOMPLETE

### Partially Built / Not Working
1. **Token price/volume display** - Not implemented
2. **Earnings tracker** - Not implemented
3. **Wallet balance display** - Not implemented
4. **Agent directory/listing** - Not implemented (single agent per user)
5. **Post-launch editing** - Cannot edit system prompt or model
6. **Twitter/X bot integration** - Config fields exist but not wired up

### Current Errors
- None critical. Console shows Privy wallet warnings (normal before login)
- 404 on missing favicon/assets (cosmetic)

### Blocking Next Steps
1. **Mainnet deployment** - Requires `USE_TESTNET=false` + funded admin wallet
2. **Real token deployment** - Needs ETH in admin wallet for gas
3. **Real ERC-8004 registration** - Needs ETH in admin wallet for gas

---

## 10. DEPLOYMENT

### Current Deployment
- **Platform:** Replit
- **URL:** `https://{repl-name}.replit.dev` (development)
- **Backend port:** 3001
- **Frontend port:** 5000

### molt.town Domain
**Not connected.** Would need:
1. Production build (`npm run build`)
2. Domain configured in Replit
3. Backend serves static files in production mode

### Current Live URL
Development only. Access via Replit webview or dev URL.

### Workflows
- **Frontend:** `npm run dev` (port 5000)
- **Backend:** `cd backend && npm run dev` (port 3001)

---

## QUICK REFERENCE

### To Test Full Flow
1. Set required env vars
2. Start both workflows
3. Click "Launch Agent" on landing page
4. Login via Privy (Twitter/Google/Email)
5. Fill agent name + token symbol
6. Click "Launch Your Agent"
7. Watch progress indicators
8. See dashboard with agent details

### To Switch to Mainnet
```bash
# Set USE_TESTNET=false
# Fund ADMIN_WALLET with ETH (for gas)
# Set MOLT_REWARD_ADDRESS to production wallet
```

### Key Files for Review
- `backend/src/services/agentLaunchService.js` - Main orchestrator
- `backend/src/services/flyService.js` - Fly.io deployment
- `backend/src/services/clankerService.js` - Token deployment
- `src/components/AgentLaunchForm.jsx` - Launch UI
- `src/components/AgentDashboard.jsx` - Post-launch UI
- `src/components/PrivyApp.jsx` - Auth + routing
