import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, appfolioConfigured } from './src/config.js';
import { store } from './src/store.js';
import { demoData } from './src/demo.js';
import { leasingMetrics, rentMetrics } from './src/metrics.js';
import { syncAppfolio } from './src/connectors/appfolio.js';
import { importCsv, mapZillowLead, mapScreening } from './src/connectors/importers.js';

const KINDS = ['units', 'leads', 'screenings', 'moveIns', 'renewals'];
const PUBLIC = path.resolve('public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
let lastSync = { at: null, error: null };

// Demo data is shown until any real data is imported/synced, so live and fake numbers never mix.
const isLive = () => KINDS.some((k) => store.has(k));
const currentData = (building) => {
  const d = isLive() ? store.get() : demoData();
  if (!building) return d;
  return Object.fromEntries(KINDS.map((k) => [k, d[k].filter((r) => r.building === building)]));
};

async function runAppfolioSync() {
  try {
    const data = await syncAppfolio();
    for (const k of KINDS) if (data[k].length) store.replace(k, data[k]);
    lastSync = { at: new Date().toISOString(), error: null, counts: Object.fromEntries(KINDS.map((k) => [k, data[k].length])) };
  } catch (e) {
    lastSync = { at: new Date().toISOString(), error: e.message };
  }
  return lastSync;
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = (req) => new Promise((ok, fail) => {
  let b = ''; req.on('data', (c) => { b += c; if (b.length > 20e6) req.destroy(); }); req.on('end', () => ok(b)); req.on('error', fail);
});
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function authorized(req) {
  if (!config.dashboardPassword) return true;
  const [, b64] = (req.headers.authorization || '').split(' ');
  const pass = Buffer.from(b64 || '', 'base64').toString().split(':').slice(1).join(':');
  return safeEq(pass, config.dashboardPassword);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    // Webhooks authenticate with a shared secret instead of the dashboard password
    if (req.method === 'POST' && p.startsWith('/api/webhooks/')) {
      if (!config.webhookSecret || !safeEq(String(req.headers['x-webhook-secret'] || ''), config.webhookSecret))
        return send(res, 401, { error: 'bad or missing X-Webhook-Secret' });
      const payload = JSON.parse((await readBody(req)) || '{}');
      const items = Array.isArray(payload) ? payload : [payload];
      const which = p.split('/').pop();
      const map = { zillow: ['leads', mapZillowLead], screening: ['screenings', mapScreening] }[which];
      if (!map) return send(res, 404, { error: 'unknown webhook' });
      items.forEach((it, i) => store.upsert(map[0], map[1](it, Date.now() + i)));
      return send(res, 200, { ok: true, received: items.length });
    }

    if (!authorized(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="dashboard"' });
      return res.end('Authentication required');
    }

    if (req.method === 'GET' && p === '/api/status') {
      const s = store.get();
      return send(res, 200, {
        mode: isLive() ? 'live' : 'demo',
        appfolioConfigured: appfolioConfigured(),
        lastSync,
        counts: Object.fromEntries(KINDS.map((k) => [k, s[k].length])),
        updatedAt: s.updatedAt,
        buildings: [...new Set(currentData().units.map((u) => u.building))].sort(),
      });
    }
    if (req.method === 'GET' && p === '/api/leasing') {
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 7));
      return send(res, 200, leasingMetrics(currentData(url.searchParams.get('building')), { days }));
    }
    if (req.method === 'GET' && p === '/api/rent') {
      const pct = Number(url.searchParams.get('maxIncreasePct'));
      return send(res, 200, rentMetrics(currentData(url.searchParams.get('building')), {
        maxIncreasePct: isNaN(pct) || url.searchParams.get('maxIncreasePct') === null ? config.renewal.maxIncreasePct : pct,
        windowDays: config.renewal.windowDays,
      }));
    }
    if (req.method === 'POST' && p.startsWith('/api/import/')) {
      const { kind, rows } = importCsv(p.split('/').pop(), await readBody(req));
      if (!rows.length) return send(res, 400, { error: 'No usable rows found. Check the file has a header row.' });
      store.replace(kind, rows);
      return send(res, 200, { ok: true, kind, imported: rows.length });
    }
    if (req.method === 'POST' && p === '/api/sync/appfolio') {
      if (!appfolioConfigured()) return send(res, 400, { error: 'Set APPFOLIO_DATABASE, APPFOLIO_CLIENT_ID and APPFOLIO_CLIENT_SECRET in .env' });
      return send(res, 200, await runAppfolioSync());
    }
    if (req.method === 'POST' && p === '/api/reset') { store.clear(); return send(res, 200, { ok: true }); }

    // Static files
    if (req.method === 'GET') {
      const file = path.join(PUBLIC, p === '/' ? 'index.html' : p);
      if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile())
        return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.listen(config.port, () => {
  console.log(`Dashboard running at http://localhost:${config.port}`);
  if (appfolioConfigured()) {
    runAppfolioSync().then((s) => console.log('AppFolio sync:', s.error || s.counts));
    setInterval(runAppfolioSync, 60 * 60 * 1000); // hourly
  } else console.log('AppFolio not configured, showing demo data until you import or connect.');
});
