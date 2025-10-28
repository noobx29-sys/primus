## Primus Telegram Trading Bot

Requirements: Node 18+.

Env:
- Create `.env` in repo root or in `/bot` with `BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN`.

Install:
```bash
cd /home/firaz/frontend/primus/bot
npm install
```

Run:
```bash
npm run start
```

Self-test only (no Telegram needed):
```bash
npm run test
```

Commands:
- `/mode` then `/swing` or `/scalping`
- `/gold` for XAUUSD
- `/fx EURUSD` or any common pair

Notes:
- Uses Yahoo Finance as primary source with fallbacks (REST, Stooq, and synthetic).
- Chart rendering falls back to line chart if candlestick fails.
- Telegram sending falls back to text-only if photo fails.


