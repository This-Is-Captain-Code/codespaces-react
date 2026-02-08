# molt-fees

Manage dynamic trading fees for your token pool using the Uniswap v4 MoltFeeRouter Hook.

## Commands

### Check Fee Analytics
Ask: "What are my current fees?" or "Show fee analytics"
Returns current fee rate, volume tier, fee split, and accrued fees.

### Change Fee Mode
Ask: "Set fee mode to aggressive" or "Switch to conservative fees"
Modes:
- **conservative**: Lower agent share, prioritize liquidity
- **balanced**: Default split across all recipients
- **aggressive**: Higher agent share, maximize agent revenue

### Fee Distribution
The fee split adjusts based on:
- Pool age (early/growth/mature phases)
- 24h trading volume (low/medium/high tiers)
- Agent-selected fee mode

Recipients: Agent Treasury, Developer, Platform (Molt.town), Admin

## API Endpoints
- GET /api/fees/analytics/:tokenAddress - Fee analytics
- POST /api/fees/set-mode - Change fee mode
- POST /api/fees/set-agent-share - Adjust agent share (200-5000 BPS)
