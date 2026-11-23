// Deterministic demo portfolio so the dashboard is usable before any account is connected.
const BUILDINGS = [
  { name: '120 Maple Ave', units: 24, base: 1850 },
  { name: '45 Harbor St', units: 16, base: 2250 },
  { name: '880 Linden Blvd', units: 32, base: 1600 },
  { name: '17 Ridge Rd', units: 12, base: 2600 },
];
const FIRST = ['Ava','Liam','Mia','Noah','Zoe','Ethan','Chloe','Lucas','Ella','Mason','Aria','Leo','Nora','Owen','Ivy','Jack','Ruby','Eli','Maya','Sam'];
const LAST = ['Cohen','Rivera','Patel','Nguyen','Smith','Garcia','Kim','Brown','Levi','Lopez','Khan','Wong','Davis','Miller','Shah','Ortiz'];

function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296); }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

export function demoData(today = new Date()) {
  const r = rng(42);
  const pickOne = (a) => a[Math.floor(r() * a.length)];
  const person = (i) => {
    const f = FIRST[i % FIRST.length], l = LAST[Math.floor(i / FIRST.length) % LAST.length]; // unique per i < 320
    return { name: `${f} ${l}`, email: `${f}.${l}${i}@example.com`.toLowerCase(), phone: `555${String(1000000 + Math.floor(r() * 8999999))}` };
  };

  const units = [], renewals = [];
  for (const b of BUILDINGS) {
    for (let u = 1; u <= b.units; u++) {
      const unit = `${Math.ceil(u / 4)}${String.fromCharCode(64 + ((u - 1) % 4) + 1)}`;
      const marketRent = Math.round((b.base + (r() - 0.5) * 300) / 25) * 25;
      const roll = r();
      const leaseEnd = addDays(today, Math.floor(r() * 365) - 20);
      let status = 'occupied', moveOutDate = null, currentRent = Math.round(marketRent * (0.86 + r() * 0.12) / 5) * 5;
      if (roll < 0.07) { status = 'vacant'; currentRent = 0; }
      else if (roll < 0.14) { status = 'notice'; moveOutDate = addDays(today, 5 + Math.floor(r() * 50)); }
      units.push({
        id: `${b.name}#${unit}`, building: b.name, unit, status, marketRent, currentRent,
        leaseEnd: status === 'vacant' ? null : leaseEnd, moveOutDate,
        tenantName: status === 'vacant' ? null : person(units.length * 7 + 3).name,
        vacantSince: status === 'vacant' ? addDays(today, -Math.floor(r() * 45)) : null,
      });
      // Past 12 months of renewal history
      if (status !== 'vacant' && r() < 0.45) {
        const eff = addDays(today, -Math.floor(r() * 360));
        const prev = Math.round(currentRent / (1 + 0.02 + r() * 0.04) / 5) * 5;
        renewals.push({ id: `ren-${b.name}-${unit}-${eff}`, building: b.name, unit, tenantName: null, prevRent: prev, newRent: currentRent, effectiveDate: eff });
      }
    }
  }

  // Leads over the last 90 days -> some screened -> some approved -> some moved in
  const vacantish = units.filter((u) => u.status !== 'occupied');
  const leads = [], screenings = [], moveIns = [];
  for (let i = 0; i < 170; i++) {
    const p = person(i + 100);
    const target = pickOne(vacantish.length ? vacantish : units);
    const receivedAt = addDays(today, -Math.floor(r() * 90));
    const lead = { id: `zl-${i}`, source: 'Zillow', ...p, building: target.building, unit: target.unit, receivedAt, message: 'Is this unit still available?' };
    leads.push(lead);
    if (r() < 0.32) {
      const completedAt = addDays(receivedAt, 1 + Math.floor(r() * 5));
      const s = r();
      const status = s < 0.55 ? 'approved' : s < 0.7 ? 'conditional' : s < 0.92 ? 'declined' : 'pending';
      // Some applicants use a different email on the screening than on Zillow: match by phone
      const email = r() < 0.2 ? `alt.${p.email}` : p.email;
      screenings.push({ id: `scr-${i}`, name: p.name, email, phone: p.phone, status, creditScore: 560 + Math.floor(r() * 260), completedAt, building: target.building, unit: target.unit });
      if ((status === 'approved' || status === 'conditional') && r() < 0.6) {
        moveIns.push({ id: `mi-${i}`, name: p.name, email: p.email, phone: p.phone, building: target.building, unit: target.unit, leaseSignedAt: addDays(completedAt, 2), moveInDate: addDays(completedAt, 10), rent: target.marketRent });
      }
    }
  }
  return { units, leads, screenings, moveIns, renewals };
}
