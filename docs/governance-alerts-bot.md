# Governance Alerts Bot (Discord)

An optional bot that posts VoteChain governance events to a Discord channel. It is
**not** part of `docker-compose.yml` and must be run separately.

Source: [`bots/governance-alerts`](../bots/governance-alerts)

## Events

| Event | Trigger | Message contents |
|-------|---------|------------------|
| `ProposalCreated` | A new proposal appears in the API | ID, title, state, deep link |
| `ProposalFinalised` | Proposal moves to a final state (passed/rejected/…) | ID, title, outcome, deep link |
| `ProposalExecuted` | Proposal is executed | ID, title, state, deep link |

The bot polls `GET {API_URL}/proposals`. On first start it seeds its cache so existing
proposals are not re-announced.

## Setup

1. In Discord: **Channel settings → Integrations → Webhooks → New Webhook**, copy the URL.
2. Store the URL as a secret — never commit it:
   - GitHub Actions: repository secret `DISCORD_WEBHOOK_URL`
   - Other deployments: your platform's secret manager, exposed as an env var
3. Build and run:

```bash
cd bots/governance-alerts
npm install
npm run build
DISCORD_WEBHOOK_URL=... API_URL=https://api.example.com FRONTEND_URL=https://app.example.com npm start
```

## Configuration

| Variable | Required | Default |
|----------|----------|---------|
| `DISCORD_WEBHOOK_URL` | yes | — |
| `API_URL` | no | `http://localhost:3001` |
| `FRONTEND_URL` | no | `http://localhost:3000` |
| `POLL_INTERVAL_MS` | no | `30000` |

Telegram support can be added by implementing an alternative `post()` using the
Telegram Bot API (`sendMessage`) with a `TELEGRAM_BOT_TOKEN` secret.
