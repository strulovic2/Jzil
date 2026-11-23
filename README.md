# Leasing Dashboard

One place to see your full leasing funnel and your rent roll. It connects:

**Zillow lead → credit check / screening → signed lease and move-in in AppFolio**

It runs on built-in **demo data** until you connect or import real data. The badge in the top-right corner shows which one you're looking at.

## What it shows

**Leasing funnel tab**
- Vacant units, and how long each has been vacant
- Units becoming vacant: notice given, plus leases ending within 60 days with no renewal yet
- For the selected period (7 / 14 / 30 / 90 days): Zillow leads received, credit checks run, qualified (approved or conditional), and rented
- 12-week trend, a breakdown by building, and every lead with its screening result, credit score, stage and move-in date

**Rent roll & renewals tab**
- Rent roll per building: units, occupied, monthly rent, average rent, potential rent at market, vacancy loss, loss-to-lease
- Leases up for renewal in the next 90 days, with a suggested new rent (current rent + up to X%, never above market rent; X is adjustable)
- Monthly rent added through renewals, per building and per month, for the last 12 months

## Run it

```bash
cp .env.example .env    # fill in credentials (optional)
npm start               # http://localhost:3000
npm test
```

Requires Node 18+. No other dependencies.

## Connecting your accounts

| Source | How it connects | What you need |
|---|---|---|
| **AppFolio** | Reports API, synced hourly and with the **Sync** button | AppFolio Property Manager Plus/Max. Get a Reports API client ID and secret from AppFolio and put them, with your database name (the `yourco` in `yourco.appfolio.com`), in `.env` |
| **Zillow Rental Manager** | Recommended: Zillow leads that already flow into AppFolio as guest cards (source contains "zillow") are picked up by the AppFolio sync. Other options: CSV import, or the webhook below | Zillow has no public lead API for Rental Manager accounts. |
| **Screening / credit checks** | AppFolio rental applications (picked up by the sync), CSV export from the screening provider, or webhook | An export from the screening provider |

Datasets with no API connection can be uploaded as CSV in **Data sources → Import a CSV export**. Column names are matched loosely ("Phone", "phone_number" and "Phone Number" all work).

### Webhooks (Zapier, Make, Zillow lead delivery, screening provider)

```
POST /api/webhooks/zillow      JSON lead or array of leads
POST /api/webhooks/screening   JSON screening result(s)
Header: X-Webhook-Secret: <WEBHOOK_SECRET from .env>
```

Example: create a Zapier "New email matching search" trigger on the inbox that receives Zillow lead emails, parse the name, email and phone, and POST them here.

### How records are linked

A lead is matched to a screening and a tenant by **email**, then by **phone** (last 10 digits). Matching falls back to **name** only when that name is unique and it's the same building, so two different people with the same name are never merged.

### How "this week" is counted

Each stage is counted in the period it **happened**: leads by date received, qualified by screening date, rented by lease-signed date. "Rented this week" therefore includes people who first messaged on Zillow weeks ago and signed this week.

## Deploying for your team

Set `DASHBOARD_PASSWORD` to require a password, then run it on any Node host (Render, Railway, Fly.io, or a small VM). Imported data is saved to `data/store.json`, which is git-ignored because it contains tenant information.

## Code layout

```
server.js                     HTTP server + API routes
src/connectors/appfolio.js    AppFolio Reports API client + field mappers
src/connectors/importers.js   CSV/webhook mappers (Zillow, screening, AppFolio exports)
src/match.js                  lead ↔ screening ↔ tenant linking
src/metrics.js                leasing funnel + rent roll/renewal calculations
src/demo.js                   demo portfolio
public/                       dashboard UI (no build step)
test/                         node:test unit tests
```
