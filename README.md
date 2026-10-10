# Light Love Healing

Bilingual (Hebrew / English) landing page for [lightlovehealing.org](https://lightlovehealing.org), served by a Cloudflare Worker with static assets.

- `public/` — the site (`index.html`)
- `worker/index.js` — `POST /api/contact` saves form submissions to D1 and notifies by email and Telegram (CallMeBot, secret `TELEGRAM_USER`); `POST /api/chat` is the Workers AI site assistant
- `migrations/` — D1 schema

## Deploy

```bash
npx wrangler deploy
```

## View form submissions

```bash
npx wrangler d1 execute lightlovehealing --remote --command "SELECT * FROM contacts ORDER BY id DESC"
```
