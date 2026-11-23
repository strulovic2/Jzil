// CSV import for each source + JSON webhook normalizers.
import { parseCsv, pick, isoDate, money } from '../csv.js';
import { mapRentRollRow, mapGuestCardRow, mapApplicationRow, mapMoveInRow, mapRenewalRow } from './appfolio.js';

// Zillow Rental Manager: Leads/Inbox export, or Zillow lead-delivery JSON
export function mapZillowLead(r, i) {
  const receivedAt = isoDate(pick(r, 'date', 'Date', 'received', 'created', 'createdAt', 'leadDate', 'Contact Date'));
  return {
    id: pick(r, 'leadId', 'lead_id', 'id') || `zl-${i}-${receivedAt}`,
    source: 'Zillow',
    name: pick(r, 'name', 'Name', 'renterName', 'Renter Name', 'fullName') || [pick(r, 'firstName', 'First Name'), pick(r, 'lastName', 'Last Name')].join(' ').trim(),
    email: pick(r, 'email', 'Email', 'renterEmail'),
    phone: pick(r, 'phone', 'Phone', 'renterPhone', 'Phone Number'),
    building: pick(r, 'property', 'Property', 'listingAddress', 'Address', 'street'),
    unit: pick(r, 'unit', 'Unit', 'unitNumber'),
    receivedAt,
    message: pick(r, 'message', 'Message', 'comments'),
  };
}

// Tenant screening provider export (credit check results)
export function mapScreening(r, i) {
  const s = mapApplicationRow(r, i);
  s.id = pick(r, 'report_id', 'reportId', 'screening_id', 'id') || `scr-${i}`;
  s.status = (pick(r, 'status', 'Status', 'result', 'Result', 'recommendation', 'Recommendation', 'decision') || 'pending').toLowerCase();
  s.creditScore = money(pick(r, 'credit_score', 'Credit Score', 'score', 'Score', 'fico'));
  return s;
}

export const IMPORTERS = {
  zillow_leads: { kind: 'leads', map: mapZillowLead, valid: (x) => x.receivedAt && (x.email || x.phone || x.name) },
  screenings: { kind: 'screenings', map: mapScreening, valid: (x) => x.name || x.email },
  appfolio_rent_roll: { kind: 'units', map: mapRentRollRow, valid: (x) => x.building && x.unit },
  appfolio_tenants: { kind: 'moveIns', map: mapMoveInRow, valid: (x) => x.moveInDate },
  appfolio_renewals: { kind: 'renewals', map: mapRenewalRow, valid: (x) => x.effectiveDate },
  appfolio_guest_cards: { kind: 'leads', map: mapGuestCardRow, valid: (x) => x.receivedAt },
};

export function importCsv(type, text) {
  const imp = IMPORTERS[type];
  if (!imp) throw new Error(`Unknown import type "${type}". Use one of: ${Object.keys(IMPORTERS).join(', ')}`);
  const rows = parseCsv(text).map(imp.map).filter(imp.valid);
  return { kind: imp.kind, rows };
}
