import fs from 'node:fs';
import path from 'node:path';

// Persisted data from imports/webhooks. Shape mirrors the normalized model in README.
const file = path.resolve(process.cwd(), 'data', 'store.json');
const empty = () => ({ units: [], leads: [], screenings: [], moveIns: [], renewals: [], updatedAt: {} });

let state = empty();
try { if (fs.existsSync(file)) state = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { state = empty(); }

const save = () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
};

export const store = {
  get: () => state,
  has: (kind) => state[kind]?.length > 0,
  // Replace a whole dataset (CSV import / full sync)
  replace(kind, rows) { state[kind] = rows; state.updatedAt[kind] = new Date().toISOString(); save(); },
  // Upsert by id (webhooks)
  upsert(kind, row) {
    const i = state[kind].findIndex((r) => r.id === row.id);
    if (i >= 0) state[kind][i] = { ...state[kind][i], ...row }; else state[kind].push(row);
    state.updatedAt[kind] = new Date().toISOString(); save();
  },
  clear() { state = empty(); save(); },
};
