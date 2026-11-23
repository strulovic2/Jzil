// AppFolio Property Manager Reports API (v2).
// Credentials: AppFolio > Settings > API (Reports API client ID/secret). Requires Plus/Max plan.
// Each report is POST https://{database}.appfolio.com/api/v2/reports/{report}.json with basic auth;
// large reports paginate via `next_page_url`.
// Column names differ slightly between AppFolio accounts, so every field is read with several fallbacks.
import { config } from '../config.js';
import { pick, money, isoDate } from '../csv.js';

const REPORTS = {
  rentRoll: 'rent_roll',
  guestCards: 'guest_card_inquiries',
  applications: 'rental_applications',
  tenants: 'tenant_directory',
  renewals: 'renewal_summary',
};

async function fetchReport(report, body = {}) {
  const { database, clientId, clientSecret } = config.appfolio;
  const auth = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  let url = `https://${database}.appfolio.com/api/v2/reports/${report}.json`;
  const rows = [];
  let first = true;
  while (url) {
    const res = await fetch(url, {
      method: first ? 'POST' : 'GET',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: first ? JSON.stringify({ paginate_results: true, ...body }) : undefined,
    });
    if (!res.ok) throw new Error(`AppFolio ${report}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    rows.push(...(Array.isArray(json) ? json : json.results || []));
    url = Array.isArray(json) ? null : json.next_page_url || null;
    first = false;
  }
  return rows;
}

// ---- Row mappers (shared with CSV import of the same AppFolio reports) ----
export function mapRentRollRow(r) {
  const building = pick(r, 'property_name', 'Property', 'property', 'Property Name');
  const unit = pick(r, 'unit', 'Unit', 'unit_name');
  const rawStatus = pick(r, 'status', 'Status', 'unit_status').toLowerCase();
  const status = rawStatus.includes('vacant') ? 'vacant' : rawStatus.includes('notice') ? 'notice' : 'occupied';
  return {
    id: `${building}#${unit}`, building, unit, status,
    marketRent: money(pick(r, 'market_rent', 'Market Rent')) ?? 0,
    currentRent: status === 'vacant' ? 0 : money(pick(r, 'rent', 'Rent', 'current_rent', 'scheduled_rent')) ?? 0,
    leaseEnd: isoDate(pick(r, 'lease_to', 'Lease To', 'lease_end', 'Lease End')),
    moveOutDate: isoDate(pick(r, 'move_out', 'Move-out', 'move_out_date', 'Notice Move Out')),
    tenantName: pick(r, 'tenant', 'Tenant', 'tenant_name') || null,
    vacantSince: status === 'vacant' ? isoDate(pick(r, 'last_move_out', 'Last Move Out', 'vacant_since')) : null,
  };
}
export function mapGuestCardRow(r, i) {
  const receivedAt = isoDate(pick(r, 'received', 'Received', 'inquiry_date', 'created_at', 'Date'));
  return {
    id: pick(r, 'guest_card_id', 'inquiry_id', 'id') || `gc-${i}-${receivedAt}`,
    source: pick(r, 'source', 'Source', 'lead_source', 'Lead Source') || 'Unknown',
    name: pick(r, 'name', 'Name', 'guest_name', 'Guest Card Name') || [pick(r, 'first_name'), pick(r, 'last_name')].join(' ').trim(),
    email: pick(r, 'email', 'Email', 'email_address'),
    phone: pick(r, 'phone', 'Phone', 'phone_number'),
    building: pick(r, 'property', 'Property', 'property_name', 'Interest Property'),
    unit: pick(r, 'unit', 'Unit', 'unit_name'),
    receivedAt,
  };
}
export function mapApplicationRow(r, i) {
  return {
    id: pick(r, 'rental_application_id', 'application_id', 'id') || `app-${i}`,
    name: pick(r, 'applicant', 'Applicant', 'name', 'applicant_name'),
    email: pick(r, 'email', 'Email'),
    phone: pick(r, 'phone', 'Phone'),
    status: pick(r, 'status', 'Status', 'decision', 'screening_result').toLowerCase() || 'pending',
    creditScore: money(pick(r, 'credit_score', 'Credit Score', 'score')),
    completedAt: isoDate(pick(r, 'received', 'decision_date', 'completed', 'Date')),
    building: pick(r, 'property', 'Property', 'property_name'),
    unit: pick(r, 'unit', 'Unit'),
  };
}
export function mapMoveInRow(r, i) {
  return {
    id: pick(r, 'tenant_id', 'occupancy_id', 'id') || `mi-${i}`,
    name: pick(r, 'tenant', 'Tenant', 'name', 'tenant_name'),
    email: pick(r, 'email', 'Email', 'emails'),
    phone: pick(r, 'phone', 'Phone', 'phone_numbers'),
    building: pick(r, 'property', 'Property', 'property_name'),
    unit: pick(r, 'unit', 'Unit'),
    moveInDate: isoDate(pick(r, 'move_in', 'Move-in', 'move_in_date')),
    leaseSignedAt: isoDate(pick(r, 'lease_from', 'Lease From', 'lease_start')),
    rent: money(pick(r, 'rent', 'Rent')),
  };
}
export function mapRenewalRow(r, i) {
  const building = pick(r, 'property', 'Property', 'property_name');
  const unit = pick(r, 'unit', 'Unit');
  const effectiveDate = isoDate(pick(r, 'lease_start', 'Lease Start', 'start_date', 'renewal_start', 'Effective Date'));
  return {
    id: `ren-${building}-${unit}-${effectiveDate || i}`, building, unit,
    tenantName: pick(r, 'tenant', 'Tenant') || null,
    prevRent: money(pick(r, 'previous_rent', 'Previous Rent', 'old_rent', 'prior_rent')) ?? 0,
    newRent: money(pick(r, 'rent', 'Rent', 'new_rent', 'New Rent')) ?? 0,
    effectiveDate,
  };
}

export async function syncAppfolio() {
  const zillow = config.appfolio.zillowSourceMatch;
  const [rentRoll, guestCards, apps, tenants, renewals] = await Promise.all([
    fetchReport(REPORTS.rentRoll),
    fetchReport(REPORTS.guestCards),
    fetchReport(REPORTS.applications),
    fetchReport(REPORTS.tenants, { tenant_statuses: ['0', '4'] }), // current + notice
    fetchReport(REPORTS.renewals).catch(() => []), // not every account has this report
  ]);
  return {
    units: rentRoll.map(mapRentRollRow).filter((u) => u.building && u.unit),
    // AppFolio already ingests Zillow inquiries as guest cards; keep only those
    leads: guestCards.map(mapGuestCardRow).filter((l) => l.source.toLowerCase().includes(zillow) && l.receivedAt),
    screenings: apps.map(mapApplicationRow),
    moveIns: tenants.map(mapMoveInRow).filter((t) => t.moveInDate),
    renewals: renewals.map(mapRenewalRow).filter((r) => r.effectiveDate),
  };
}
