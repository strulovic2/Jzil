const $ = (s) => document.querySelector(s);
const fmt$ = (n) => (n == null ? '—' : '$' + Math.round(n).toLocaleString());
const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString());
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (u, opt) => { const r = await fetch(u, opt); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

// ---------- helpers ----------
function kpis(el, items) {
  el.innerHTML = items.map((k) => `<div class="kpi"><div class="label">${esc(k.label)}</div><div class="value">${k.value}</div>${k.sub ? `<div class="sub">${esc(k.sub)}</div>` : ''}</div>`).join('');
}
function table(el, cols, rows, foot) {
  if (!rows.length) { el.innerHTML = '<p class="muted">Nothing here.</p>'; return; }
  const th = cols.map((c) => `<th class="${c.n ? 'n' : ''}">${esc(c.h)}</th>`).join('');
  const tr = rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.n ? 'n' : ''}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join('')}</tr>`).join('');
  const tf = foot ? `<tfoot><tr>${cols.map((c) => `<td class="${c.n ? 'n' : ''}">${foot[c.k] ?? ''}</td>`).join('')}</tr></tfoot>` : '';
  el.innerHTML = `<div class="tablewrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody>${tf}</table></div>`;
}
const pill = (s) => (s ? `<span class="pill ${esc(s)}">${esc(s)}</span>` : '<span class="muted">—</span>');
const tip = $('#tip');
function showTip(e, html) { tip.innerHTML = html; tip.hidden = false; const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8); tip.style.left = x + 'px'; tip.style.top = (e.clientY + 14) + 'px'; }
const hideTip = () => { tip.hidden = true; };
const shortDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const shortMonth = (ym) => new Date(ym + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
const niceMax = (v) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1); };

// Line chart with crosshair tooltip
function lineChart(el, rows, xKey, series, xFmt) {
  const W = Math.max(300, el.clientWidth), H = 240, m = { t: 10, r: 12, b: 26, l: 36 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.k]))));
  const x = (i) => m.l + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const y = (v) => m.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly funnel trend">`;
  svg += ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmtN(t)}</text>`).join('');
  rows.forEach((r, i) => { if (i % 2 === rows.length % 2 || i === rows.length - 1) svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${xFmt(r[xKey])}</text>`; });
  series.forEach((s, si) => {
    svg += `<polyline fill="none" stroke="${SERIES[si]}" stroke-width="2" stroke-linejoin="round" points="${rows.map((r, i) => `${x(i)},${y(r[s.k])}`).join(' ')}"/>`;
  });
  svg += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="var(--text-2)" stroke-dasharray="3 3" visibility="hidden"/>`;
  series.forEach((s, si) => { svg += `<circle class="dot${si}" r="4" fill="${SERIES[si]}" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`; });
  svg += `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="hit"/></svg>`;
  el.innerHTML = `<div class="legend">${series.map((s, i) => `<span><i style="background:${SERIES[i]}"></i>${esc(s.label)}</span>`).join('')}</div>${svg}`;
  const root = el.querySelector('svg'), xh = root.querySelector('.xh');
  root.querySelector('.hit').addEventListener('mousemove', (e) => {
    const b = root.getBoundingClientRect(); const px = ((e.clientX - b.left) / b.width) * W;
    const i = Math.max(0, Math.min(rows.length - 1, Math.round(((px - m.l) / iw) * (rows.length - 1))));
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
    series.forEach((s, si) => { const d = root.querySelector('.dot' + si); d.setAttribute('cx', x(i)); d.setAttribute('cy', y(rows[i][s.k])); d.setAttribute('visibility', 'visible'); });
    showTip(e, `<b>Week ending ${xFmt(rows[i][xKey])}</b>` + series.map((s, si) => `<div class="r"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${SERIES[si]};margin-right:5px"></i>${esc(s.label)}</span><b>${fmtN(rows[i][s.k])}</b></div>`).join(''));
  });
  root.querySelector('.hit').addEventListener('mouseleave', () => { hideTip(); xh.setAttribute('visibility', 'hidden'); series.forEach((_, si) => root.querySelector('.dot' + si).setAttribute('visibility', 'hidden')); });
}

// Stacked bars (one segment per building), 2px surface gap between segments
function stackedBars(el, rows, keys, colorFor) {
  const W = Math.max(300, el.clientWidth), H = 260, m = { t: 10, r: 12, b: 26, l: 52 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = niceMax(Math.max(1, ...rows.map((r) => keys.reduce((t, k) => t + r[k], 0))));
  const bw = (iw / rows.length) * 0.6, y = (v) => m.t + ih - (v / max) * ih;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly rent increase from renewals">`;
  svg += [0, max / 2, max].map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt$(t)}</text>`).join('');
  rows.forEach((r, i) => {
    const cx = m.l + (i + 0.5) * (iw / rows.length);
    let acc = 0;
    keys.forEach((k) => {
      if (!r[k]) return;
      const y0 = y(acc), y1 = y(acc + r[k]); acc += r[k];
      svg += `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1 - 2)}" rx="2" fill="${colorFor(k)}"/>`;
    });
    svg += `<rect class="hit" data-i="${i}" x="${cx - iw / rows.length / 2}" y="${m.t}" width="${iw / rows.length}" height="${ih}" fill="transparent"/>`;
    svg += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${shortMonth(r.month)}</text>`;
  });
  svg += '</svg>';
  el.innerHTML = `<div class="legend">${keys.map((k) => `<span><i style="background:${colorFor(k)}"></i>${esc(k)}</span>`).join('')}</div>${svg}`;
  el.querySelectorAll('.hit').forEach((h) => {
    h.addEventListener('mousemove', (e) => {
      const r = rows[h.dataset.i];
      showTip(e, `<b>${shortMonth(r.month)}: +${fmt$(r.total)}/mo from ${r.count} renewal${r.count === 1 ? '' : 's'}</b>` + keys.filter((k) => r[k]).map((k) => `<div class="r"><span>${esc(k)}</span><b>+${fmt$(r[k])}</b></div>`).join(''));
    });
    h.addEventListener('mouseleave', hideTip);
  });
}

// ---------- state ----------
let status, buildingColors = {};
const colorFor = (b) => buildingColors[b] || 'var(--muted)';

async function loadStatus() {
  status = await api('/api/status');
  const badge = $('#mode');
  badge.className = 'badge ' + status.mode;
  badge.textContent = status.mode === 'demo' ? 'Demo data: connect sources in Data sources' : 'Live data';
  // Color follows the building (fixed order), never its rank in a filtered view
  status.buildings.forEach((b, i) => { buildingColors[b] = i < 8 ? SERIES[i] : 'var(--muted)'; });
  for (const id of ['#leasing-building', '#rent-building']) {
    const sel = $(id), cur = sel.value;
    sel.innerHTML = '<option value="">All buildings</option>' + status.buildings.map((b) => `<option ${b === cur ? 'selected' : ''}>${esc(b)}</option>`).join('');
  }
  $('#status').innerHTML = `<dl class="status">
    <dt>Mode</dt><dd>${status.mode === 'demo' ? 'Demo (no real data loaded yet)' : 'Live'}</dd>
    <dt>AppFolio API</dt><dd>${status.appfolioConfigured ? 'Configured' : 'Not configured: add credentials to .env'}${status.lastSync.at ? ` · last sync ${new Date(status.lastSync.at).toLocaleString()}${status.lastSync.error ? ` · <span style="color:var(--bad)">${esc(status.lastSync.error)}</span>` : ''}` : ''}</dd>
    ${Object.entries(status.counts).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${fmtN(v)} rows${status.updatedAt[k] ? ` · updated ${new Date(status.updatedAt[k]).toLocaleString()}` : ''}</dd>`).join('')}
  </dl>`;
}

async function loadLeasing() {
  const q = new URLSearchParams({ days: $('#days').value, building: $('#leasing-building').value });
  const d = await api('/api/leasing?' + q);
  const k = d.kpis, label = $('#days').selectedOptions[0].textContent.toLowerCase();
  kpis($('#leasing-kpis'), [
    { label: 'Vacant units', value: fmtN(k.vacant), sub: `${k.occupancyPct}% occupied of ${fmtN(k.totalUnits)}` },
    { label: 'Becoming vacant', value: fmtN(k.becomingVacant), sub: `notice given · +${k.expiringNoNotice} leases ending ≤60d unrenewed` },
    { label: 'Zillow leads', value: fmtN(k.leads), sub: label },
    { label: 'Credit checks run', value: fmtN(k.screened), sub: `on Zillow leads, ${label}` },
    { label: 'Qualified', value: fmtN(k.qualified), sub: `approved or conditional, ${label}` },
    { label: 'Rented', value: fmtN(k.leased), sub: `Zillow leads who signed, ${label}` },
  ]);
  lineChart($('#trend'), d.weeks, 'weekEnding', [
    { k: 'leads', label: 'Leads' }, { k: 'qualified', label: 'Qualified' }, { k: 'leased', label: 'Rented' },
  ], shortDate);
  const tot = (key) => d.byBuilding.reduce((t, r) => t + r[key], 0);
  table($('#by-building'), [
    { h: 'Building', k: 'building' }, { h: 'Units', k: 'units', n: 1 }, { h: 'Vacant', k: 'vacant', n: 1 }, { h: 'Notice', k: 'notice', n: 1 },
    { h: 'Leads', k: 'leads', n: 1 }, { h: 'Qualified', k: 'qualified', n: 1 }, { h: 'Rented', k: 'leased', n: 1 },
  ], d.byBuilding, d.byBuilding.length > 1 ? { building: 'Total', ...Object.fromEntries(['units', 'vacant', 'notice', 'leads', 'qualified', 'leased'].map((x) => [x, fmtN(tot(x))])) } : null);
  table($('#vacant'), [
    { h: 'Building', k: 'building' }, { h: 'Unit', k: 'unit' }, { h: 'Market rent', k: 'marketRent', n: 1, f: (r) => fmt$(r.marketRent) },
    { h: 'Days vacant', k: 'daysVacant', n: 1, f: (r) => fmtN(r.daysVacant) },
  ], d.vacantUnits);
  table($('#upcoming'), [
    { h: 'Building', k: 'building' }, { h: 'Unit', k: 'unit' }, { h: 'Date', k: 'date', f: (r) => shortDate(r.date) }, { h: 'Why', k: 'reason' },
    { h: 'Rent', k: 'currentRent', n: 1, f: (r) => fmt$(r.currentRent) },
  ], d.upcomingVacancies);
  table($('#leads'), [
    { h: 'Received', k: 'receivedAt', f: (r) => shortDate(r.receivedAt) }, { h: 'Name', k: 'name' }, { h: 'Email', k: 'email' }, { h: 'Phone', k: 'phone' },
    { h: 'Building', k: 'building' }, { h: 'Unit', k: 'unit' }, { h: 'Screening', k: 'screeningStatus', f: (r) => pill(r.screeningStatus) },
    { h: 'Credit', k: 'creditScore', n: 1, f: (r) => fmtN(r.creditScore) }, { h: 'Stage', k: 'stage', f: (r) => pill(r.stage) },
    { h: 'Move-in', k: 'moveInDate', f: (r) => (r.moveInDate ? shortDate(r.moveInDate) : '—') },
  ], d.leads);
}

async function loadRent() {
  const q = new URLSearchParams({ maxIncreasePct: $('#cap').value, building: $('#rent-building').value });
  const d = await api('/api/rent?' + q);
  const t = d.totals;
  kpis($('#rent-kpis'), [
    { label: 'Monthly rent roll', value: fmt$(t.monthlyRent), sub: `of ${fmt$(t.potentialRent)} potential` },
    { label: 'Vacancy loss', value: fmt$(t.vacancyLoss), sub: 'market rent of vacant units / mo' },
    { label: 'Loss to lease', value: fmt$(t.lossToLease), sub: 'occupied units below market / mo' },
    { label: 'Raised via renewals', value: '+' + fmt$(t.raisedLast12Mo), sub: `per month, from ${t.renewalsLast12Mo} renewals in 12 mo` },
    { label: 'Renewals coming up', value: fmtN(t.renewalsUpcoming), sub: `next ${d.windowDays} days` },
    { label: 'Renewal upside', value: '+' + fmt$(t.upsideFromRenewals), sub: `per month at ≤${d.maxIncreasePct}% cap` },
  ]);
  const sumK = (k) => d.rentRoll.reduce((s, r) => s + r[k], 0);
  table($('#rent-roll'), [
    { h: 'Building', k: 'building' }, { h: 'Units', k: 'units', n: 1 }, { h: 'Occupied', k: 'occupied', n: 1 }, { h: 'Vacant', k: 'vacant', n: 1 },
    { h: 'Monthly rent', k: 'monthlyRent', n: 1, f: (r) => fmt$(r.monthlyRent) }, { h: 'Avg rent', k: 'avgRent', n: 1, f: (r) => fmt$(r.avgRent) },
    { h: 'Potential (market)', k: 'potentialRent', n: 1, f: (r) => fmt$(r.potentialRent) },
    { h: 'Vacancy loss', k: 'vacancyLoss', n: 1, f: (r) => fmt$(r.vacancyLoss) }, { h: 'Loss to lease', k: 'lossToLease', n: 1, f: (r) => fmt$(r.lossToLease) },
  ], d.rentRoll, d.rentRoll.length > 1 ? {
    building: 'Total', units: fmtN(sumK('units')), occupied: fmtN(sumK('occupied')), vacant: fmtN(sumK('vacant')),
    monthlyRent: fmt$(sumK('monthlyRent')), potentialRent: fmt$(sumK('potentialRent')), vacancyLoss: fmt$(sumK('vacancyLoss')), lossToLease: fmt$(sumK('lossToLease')),
  } : null);
  stackedBars($('#raises'), d.raisesByMonth, d.buildings, colorFor);
  table($('#raises-table'), [
    { h: 'Month', k: 'month', f: (r) => shortMonth(r.month) }, { h: 'Renewals', k: 'count', n: 1 },
    ...d.buildings.map((b) => ({ h: b, k: b, n: 1, f: (r) => (r[b] ? '+' + fmt$(r[b]) : '—') })),
    { h: 'Total / mo', k: 'total', n: 1, f: (r) => '+' + fmt$(r.total) },
  ], [...d.raisesByMonth].reverse());
  $('#renew-note').textContent = `Suggested rent = current rent raised up to ${d.maxIncreasePct}%, never above market rent.`;
  table($('#renewals'), [
    { h: 'Lease ends', k: 'leaseEnd', f: (r) => `${shortDate(r.leaseEnd)} <span class="muted">(${r.daysUntil}d)</span>` },
    { h: 'Building', k: 'building' }, { h: 'Unit', k: 'unit' }, { h: 'Tenant', k: 'tenantName' },
    { h: 'Current', k: 'currentRent', n: 1, f: (r) => fmt$(r.currentRent) }, { h: 'Market', k: 'marketRent', n: 1, f: (r) => fmt$(r.marketRent) },
    { h: 'Below market', k: 'belowMarket', n: 1, f: (r) => fmt$(r.belowMarket) },
    { h: 'Suggested', k: 'suggestedRent', n: 1, f: (r) => `<b>${fmt$(r.suggestedRent)}</b>` },
    { h: 'Raise', k: 'raise', n: 1, f: (r) => (r.raise ? `+${fmt$(r.raise)} <span class="muted">(${r.raisePct}%)</span>` : '—') },
  ], d.renewalOpportunities);
}

// ---------- wiring ----------
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== 'tab-' + b.dataset.tab; });
  try { localStorage.setItem('tab', b.dataset.tab); } catch {}
  if (status) (b.dataset.tab === 'rent' ? loadRent() : b.dataset.tab === 'leasing' ? loadLeasing() : null); // charts size to visible width
}));
['#days', '#leasing-building'].forEach((s) => $(s).addEventListener('change', loadLeasing));
['#cap', '#rent-building'].forEach((s) => $(s).addEventListener('change', loadRent));
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { loadLeasing(); loadRent(); }, 200); });
const refreshAll = async () => { await loadStatus(); await Promise.all([loadLeasing(), loadRent()]); };
$('#sync').addEventListener('click', async () => {
  $('#sync-msg').textContent = 'Syncing…';
  try { const r = await api('/api/sync/appfolio', { method: 'POST' }); $('#sync-msg').textContent = r.error ? 'Error: ' + r.error : 'Synced.'; }
  catch (e) { $('#sync-msg').textContent = e.message; }
  refreshAll();
});
$('#reset').addEventListener('click', async () => { if (confirm('Remove all imported data and show demo data?')) { await api('/api/reset', { method: 'POST' }); refreshAll(); } });
$('#import-go').addEventListener('click', async () => {
  const f = $('#import-file').files[0];
  if (!f) { $('#import-msg').textContent = 'Choose a CSV file first.'; return; }
  try {
    const r = await api('/api/import/' + $('#import-type').value, { method: 'POST', body: await f.text(), headers: { 'Content-Type': 'text/csv' } });
    $('#import-msg').textContent = `Imported ${r.imported} rows into ${r.kind}.`;
    refreshAll();
  } catch (e) { $('#import-msg').textContent = 'Import failed: ' + e.message; }
});
try { const t = localStorage.getItem('tab'); if (t) document.querySelector(`.tabs button[data-tab="${t}"]`)?.click(); } catch {}
refreshAll().catch((e) => { document.querySelector('main').insertAdjacentHTML('afterbegin', `<p style="color:var(--bad)">${esc(e.message)}</p>`); });
