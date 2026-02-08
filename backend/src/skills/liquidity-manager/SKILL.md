# Liquidity Manager Skill

## Overview
Cross-chain liquidity management using a four-layer architecture:
1. **You (OpenClaw agent)** — decide what should happen
2. **Yellow Network** — decide when to execute (buffer, batch, optimize timing)
3. **LI.FI** — move funds across chains (Base → Arbitrum)
4. **Uniswap v4** — deploy capital into programmable pools with hooks

## Chain Strategy
- **Source chain**: Base (high retail liquidity, cheap transactions)
- **Destination chain**: Arbitrum One (Uniswap v4-native, deep DeFi liquidity)
- Capital starts on Base → moves to Arbitrum → earns fees intelligently

## Your Decision Framework
Only act when:
- Expected fee improvement exceeds execution cost
- Market conditions have changed meaningfully (not noise)
- Sufficient time has passed since last rebalance

Stay idle when:
- Conditions are stable
- Gas costs would eat into gains
- Recent rebalance was performed

Always explain every action you take and why.

## Available Tools

### observe_state
Observe current pool state, positions, and buffer status.
```
GET /api/liquidity/observe?tokenAddress={addr}&chain={chain}
```
Returns: pool state (TVL, volume, fees, APY), Yellow Network buffer status, recent intents, active positions.

### emit_intent
Create a new liquidity intent. Yellow Network will buffer it.
```
POST /api/liquidity/intents
Body: {
  "botId": "your-bot-id",
  "intentType": "MOVE_LIQUIDITY | DEPLOY_CAPITAL | REBALANCE | WITHDRAW",
  "sourceChain": "base",
  "destChain": "arbitrum",
  "tokenAddress": "0x...",
  "tokenSymbol": "TOKEN",
  "amount": "1000",
  "conditions": {
    "minFeeGainPercent": 0.5,
    "maxGasCostUsd": 5.0
  }
}
```

### check_buffer
Check what's currently buffered in Yellow Network.
```
GET /api/liquidity/intents?status=buffered
```

### buffer_intent
Send a pending intent to Yellow Network for buffering.
```
POST /api/liquidity/intents/{intentId}/buffer
```

### release_intent
Release a buffered intent for execution (Yellow confirms conditions are stable).
```
POST /api/liquidity/intents/{intentId}/release
```

### execute_pipeline
Execute the full pipeline: intent → buffer → move → deploy (all in one call).
```
POST /api/liquidity/execute-pipeline
Body: {
  "botId": "your-bot-id",
  "intentType": "MOVE_LIQUIDITY",
  "sourceChain": "base",
  "destChain": "arbitrum",
  "tokenAddress": "0x...",
  "amount": "1000",
  "conditions": { "minFeeGainPercent": 0.5 },
  "skipBuffer": false
}
```
Set `skipBuffer: true` to bypass Yellow Network (execute immediately).

### get_quote
Get a cross-chain movement quote from LI.FI.
```
POST /api/liquidity/quote
Body: {
  "fromChain": "base",
  "toChain": "arbitrum",
  "fromAmount": "1000000000000000000",
  "fromAddress": "0x..."
}
```

### view_positions
View active liquidity positions across chains.
```
GET /api/liquidity/positions?botId={botId}
```

### view_movements
View cross-chain movement history.
```
GET /api/liquidity/movements?limit=10
```

### view_analytics
View aggregate analytics on intents, positions, and movements.
```
GET /api/liquidity/analytics
```

## Intent Types
- **MOVE_LIQUIDITY**: Move capital from one chain to another and deploy into a pool
- **DEPLOY_CAPITAL**: Deploy capital into a Uniswap v4 pool on the destination chain
- **REBALANCE**: Adjust existing positions (may involve cross-chain movement)
- **WITHDRAW**: Remove liquidity from a pool

## Conditions (for Yellow Network)
- `minFeeGainPercent`: Only execute if expected fee gain exceeds this percentage
- `maxGasCostUsd`: Only execute if gas cost is below this USD amount
- `minAmountUsd`: Only execute if the amount exceeds this USD value

## Example Decision Flow
1. Call `observe_state` to check current pool metrics
2. Determine if fee rates on Arbitrum justify moving capital from Base
3. If yes, call `emit_intent` with conditions
4. Yellow Network buffers the intent and checks stability
5. When conditions remain valid, Yellow releases for execution
6. LI.FI moves funds from Base to Arbitrum
7. Uniswap v4 deploys capital into the pool with MoltFeeRouter hook
8. Report the outcome

## Important
- You are the orchestrator. Every protocol serves you.
- Be patient. Yellow Network exists to prevent you from thrashing.
- Explain your reasoning before every action.
- If conditions don't justify action, say so and stay idle.
