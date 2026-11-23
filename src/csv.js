// Small RFC4180-ish CSV parser: handles quotes, escaped quotes, commas/newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// Look up a value by any of several candidate column names (case/space/punctuation-insensitive).
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export function pick(row, ...names) {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((key) => norm(key) === norm(n));
    if (k !== undefined && row[k] !== '' && row[k] != null) return row[k];
  }
  return '';
}

export const money = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
};

export const isoDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
};
