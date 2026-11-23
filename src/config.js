import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader (no dependencies).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 3000),
  dashboardPassword: process.env.DASHBOARD_PASSWORD || '',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  appfolio: {
    database: process.env.APPFOLIO_DATABASE || '',
    clientId: process.env.APPFOLIO_CLIENT_ID || '',
    clientSecret: process.env.APPFOLIO_CLIENT_SECRET || '',
    zillowSourceMatch: (process.env.APPFOLIO_ZILLOW_SOURCE_MATCH || 'zillow').toLowerCase(),
  },
  renewal: {
    maxIncreasePct: num(process.env.RENEWAL_MAX_INCREASE_PCT, 5),
    windowDays: num(process.env.RENEWAL_WINDOW_DAYS, 90),
  },
};

export const appfolioConfigured = () =>
  Boolean(config.appfolio.database && config.appfolio.clientId && config.appfolio.clientSecret);
