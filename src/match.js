// Links a Zillow lead to its screening record and its AppFolio move-in.
// Match order: email -> phone -> exact name. Emails/phones are normalized first.
export const normEmail = (e) => (e || '').trim().toLowerCase();
export const normPhone = (p) => { const d = (p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
export const normName = (n) => (n || '').trim().toLowerCase().replace(/\s+/g, ' ');

function index(rows) {
  const byEmail = new Map(), byPhone = new Map(), byName = new Map();
  for (const r of rows) {
    const e = normEmail(r.email), p = normPhone(r.phone), n = normName(r.name);
    if (e && !byEmail.has(e)) byEmail.set(e, r);
    if (p && !byPhone.has(p)) byPhone.set(p, r);
    // Names are only trusted when unique, two different "Maria Garcia"s must not merge
    if (n) byName.set(n, byName.has(n) && byName.get(n) !== r ? null : r);
  }
  return (q) => {
    const hit = byEmail.get(normEmail(q.email)) || byPhone.get(normPhone(q.phone));
    if (hit) return hit;
    // Name fallback only within the same building, so a different person with the same name doesn't merge
    const byN = byName.get(normName(q.name));
    return byN && (!q.building || !byN.building || byN.building === q.building) ? byN : null;
  };
}

const QUALIFIED = new Set(['approved', 'conditional', 'accepted', 'approved with conditions', 'pass']);
export const isQualified = (status) => QUALIFIED.has(String(status || '').toLowerCase());

export function linkFunnel({ leads, screenings, moveIns }) {
  const findScreening = index(screenings);
  const findMoveIn = index(moveIns);
  return leads.map((lead) => {
    const screening = findScreening(lead);
    const moveIn = findMoveIn(lead) || (screening && findMoveIn(screening));
    const stage = moveIn ? 'leased' : screening ? (isQualified(screening.status) ? 'qualified' : screening.status === 'pending' ? 'screening' : 'declined') : 'lead';
    return { ...lead, screening, moveIn, stage };
  });
}
