import { linkFunnel, isQualified } from './match.js';

const DAY = 86400000;
const toDate = (s) => (s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')) : null);
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
const sum = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0);
const monthKey = (s) => s.slice(0, 7);

export function leasingMetrics(data, { days = 7, today = new Date() } = {}) {
  const todayIso = today.toISOString().slice(0, 10);
  const start = new Date(today.getTime() - days * DAY).toISOString().slice(0, 10);
  const in60 = new Date(today.getTime() + 60 * DAY).toISOString().slice(0, 10);
  
  const { units } = data;
  const vacant = units.filter((u) => u.status === 'vacant');
  const onNotice = units.filter((u) => u.status === 'notice');
  // Leases ending in the next 60 days with no renewal/notice yet are "at risk" of vacating
  const expiringNoNotice = units.filter((u) => u.status === 'occupied' && u.leaseEnd && u.leaseEnd >= todayIso && u.leaseEnd <= in60);

  // Activity view: each stage is counted in the period it happened (lead received, screening
  // completed, lease signed), so "this week" answers "what happened this week", including
  // leases signed this week by people who first messaged on Zillow weeks ago.
  const funnel = linkFunnel(data);
  const screenedOn = (l) => l.screening && (l.screening.completedAt || l.receivedAt);
  const leasedOn = (l) => l.moveIn && (l.moveIn.leaseSignedAt || l.moveIn.moveInDate);
  const between = (d, a, b) => d && d > a && d <= b;
  const stageCounts = (a, b) => ({
    leads: funnel.filter((l) => between(l.receivedAt, a, b)),
    screened: funnel.filter((l) => between(screenedOn(l), a, b)),
    qualified: funnel.filter((l) => between(screenedOn(l), a, b) && isQualified(l.screening.status)),
    leased: funnel.filter((l) => between(leasedOn(l), a, b)),
  });
  const startExcl = new Date(today.getTime() - (days + 0) * DAY).toISOString().slice(0, 10);
  const cur = stageCounts(startExcl, todayIso);
  const periodLeads = cur.leads, screened = cur.screened, qualified = cur.qualified, leased = cur.leased;

  // Weekly trend for the last 12 weeks
  const weeks = [];
  for (let w = 11; w >= 0; w--) {
    const ws = new Date(today.getTime() - (w + 1) * 7 * DAY).toISOString().slice(0, 10);
    const we = new Date(today.getTime() - w * 7 * DAY).toISOString().slice(0, 10);
    const c = stageCounts(ws, we);
    weeks.push({ weekEnding: we, leads: c.leads.length, qualified: c.qualified.length, leased: c.leased.length });
  }

  const buildings = [...new Set(units.map((u) => u.building))].sort();
  const byBuilding = buildings.map((b) => {
    const bl = periodLeads.filter((l) => l.building === b);
    return {
      building: b,
      units: units.filter((u) => u.building === b).length,
      vacant: vacant.filter((u) => u.building === b).length,
      notice: onNotice.filter((u) => u.building === b).length,
      leads: bl.length,
      qualified: qualified.filter((l) => l.building === b).length,
      leased: leased.filter((l) => l.building === b).length,
    };
  });

  return {
    period: { days, start, end: todayIso },
    kpis: {
      totalUnits: units.length,
      vacant: vacant.length,
      becomingVacant: onNotice.length,
      expiringNoNotice: expiringNoNotice.length,
      occupancyPct: units.length ? Math.round(((units.length - vacant.length) / units.length) * 1000) / 10 : 0,
      leads: periodLeads.length,
      screened: screened.length,
      qualified: qualified.length,
      leased: leased.length,
      leadToLeasePct: periodLeads.length ? Math.round((leased.length / periodLeads.length) * 1000) / 10 : 0,
    },
    weeks,
    byBuilding,
    vacantUnits: vacant.map((u) => ({ ...u, daysVacant: u.vacantSince ? daysBetween(u.vacantSince, todayIso) : null }))
      .sort((a, b) => (b.daysVacant ?? 0) - (a.daysVacant ?? 0)),
    upcomingVacancies: [...onNotice, ...expiringNoNotice]
      .map((u) => ({ ...u, date: u.moveOutDate || u.leaseEnd, reason: u.status === 'notice' ? 'Notice given' : 'Lease ending, no renewal yet' }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    leads: [...new Set([...periodLeads, ...screened, ...leased])]
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .map(({ screening, moveIn, ...l }) => ({
        ...l,
        screeningStatus: screening?.status || null,
        creditScore: screening?.creditScore ?? null,
        moveInDate: moveIn?.moveInDate || null,
      })),
  };
}

export function rentMetrics(data, { today = new Date(), maxIncreasePct = 5, windowDays = 90 } = {}) {
  const todayIso = today.toISOString().slice(0, 10);
  const windowEnd = new Date(today.getTime() + windowDays * DAY).toISOString().slice(0, 10);
  const { units, renewals } = data;
  const buildings = [...new Set(units.map((u) => u.building))].sort();

  const rentRoll = buildings.map((b) => {
    const bu = units.filter((u) => u.building === b);
    const occ = bu.filter((u) => u.status !== 'vacant');
    const actual = sum(occ, (u) => u.currentRent);
    const marketOcc = sum(occ, (u) => u.marketRent);
    return {
      building: b,
      units: bu.length,
      occupied: occ.length,
      vacant: bu.length - occ.length,
      monthlyRent: actual,
      potentialRent: sum(bu, (u) => u.marketRent),
      vacancyLoss: sum(bu.filter((u) => u.status === 'vacant'), (u) => u.marketRent),
      lossToLease: marketOcc - actual,
      avgRent: occ.length ? Math.round(actual / occ.length) : 0,
    };
  });

  // Leases expiring within the window that haven't given notice: candidates for a renewal raise
  const cap = maxIncreasePct / 100;
  const renewalOpportunities = units
    .filter((u) => u.status === 'occupied' && u.leaseEnd && u.leaseEnd >= todayIso && u.leaseEnd <= windowEnd)
    .map((u) => {
      const suggested = Math.floor(Math.min(u.marketRent, u.currentRent * (1 + cap)) / 5) * 5; // round down so the cap is never exceeded
      const raise = Math.max(0, suggested - u.currentRent);
      return {
        building: u.building, unit: u.unit, tenantName: u.tenantName, leaseEnd: u.leaseEnd,
        daysUntil: daysBetween(todayIso, u.leaseEnd), currentRent: u.currentRent, marketRent: u.marketRent,
        belowMarket: u.marketRent - u.currentRent, suggestedRent: Math.max(suggested, u.currentRent), raise,
        raisePct: u.currentRent ? Math.round((raise / u.currentRent) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => a.leaseEnd.localeCompare(b.leaseEnd));

  // Renewal raises by month x building (last 12 months)
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const raised = renewals.filter((r) => r.newRent > r.prevRent && months.includes(monthKey(r.effectiveDate)));
  const raisesByMonth = months.map((m) => {
    const row = { month: m, total: 0, count: 0 };
    for (const b of buildings) {
      const rs = raised.filter((r) => r.building === b && monthKey(r.effectiveDate) === m);
      row[b] = sum(rs, (r) => r.newRent - r.prevRent);
      row.total += row[b];
      row.count += rs.length;
    }
    return row;
  });

  return {
    buildings,
    totals: {
      monthlyRent: sum(rentRoll, (r) => r.monthlyRent),
      potentialRent: sum(rentRoll, (r) => r.potentialRent),
      lossToLease: sum(rentRoll, (r) => r.lossToLease),
      vacancyLoss: sum(rentRoll, (r) => r.vacancyLoss),
      renewalsUpcoming: renewalOpportunities.length,
      upsideFromRenewals: sum(renewalOpportunities, (r) => r.raise),
      raisedLast12Mo: sum(raisesByMonth, (r) => r.total),
      renewalsLast12Mo: sum(raisesByMonth, (r) => r.count),
    },
    rentRoll,
    renewalOpportunities,
    raisesByMonth,
    maxIncreasePct,
    windowDays,
  };
}
