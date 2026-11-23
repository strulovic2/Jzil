import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.js';
import { linkFunnel } from '../src/match.js';
import { leasingMetrics, rentMetrics } from '../src/metrics.js';
import { importCsv } from '../src/connectors/importers.js';
import { demoData } from '../src/demo.js';

test('parseCsv handles quotes, commas and BOM', () => {
  const rows = parseCsv('﻿Name,Message\n"Doe, Jane","said ""hi"""\n');
  assert.deepEqual(rows, [{ Name: 'Doe, Jane', Message: 'said "hi"' }]);
});

test('funnel links by email, then phone, never merges same-name strangers', () => {
  const leads = [
    { id: 'a', name: 'Ana Ruiz', email: 'ANA@x.com', phone: '', building: 'B1', receivedAt: '2026-11-20' },
    { id: 'b', name: 'Ben Ko', email: 'ben@x.com', phone: '(555) 123-4567', building: 'B1', receivedAt: '2026-11-20' },
    { id: 'c', name: 'Cy Li', email: 'cy1@x.com', phone: '5550000001', building: 'B1', receivedAt: '2026-11-20' },
  ];
  const screenings = [
    { id: 's1', name: 'Ana Ruiz', email: 'ana@x.com', status: 'approved' },
    { id: 's2', name: 'Ben Ko', email: 'other@x.com', phone: '+1 555-123-4567', status: 'declined' },
    { id: 's3', name: 'Cy Li', email: 'cy2@x.com', phone: '5550000002', building: 'B2', status: 'approved' },
  ];
  const moveIns = [{ id: 'm1', name: 'Ana Ruiz', email: 'ana@x.com', moveInDate: '2026-11-22' }];
  const f = linkFunnel({ leads, screenings, moveIns });
  assert.equal(f[0].stage, 'leased');
  assert.equal(f[1].screening.id, 's2');
  assert.equal(f[1].stage, 'declined');
  assert.equal(f[2].screening, null);
});

test('zillow CSV import maps common headers', () => {
  const { kind, rows } = importCsv('zillow_leads', 'Date,First Name,Last Name,Email,Phone Number,Address\n2026-11-20,Jo,Ma,jo@x.com,5551112222,12 Oak St\n');
  assert.equal(kind, 'leads');
  assert.equal(rows[0].name, 'Jo Ma');
  assert.equal(rows[0].building, '12 Oak St');
  assert.equal(rows[0].receivedAt, '2026-11-20');
});

test('renewal suggestion respects cap and market rent', () => {
  const today = new Date('2026-11-23T12:00:00Z');
  const units = [
    { building: 'B', unit: '1', status: 'occupied', currentRent: 1000, marketRent: 1200, leaseEnd: '2026-12-31' },
    { building: 'B', unit: '2', status: 'occupied', currentRent: 1000, marketRent: 1020, leaseEnd: '2027-01-15' },
  ];
  const renewals = [{ building: 'B', unit: '3', prevRent: 900, newRent: 950, effectiveDate: '2026-10-01' }];
  const r = rentMetrics({ units, renewals }, { today, maxIncreasePct: 5, windowDays: 90 });
  assert.equal(r.renewalOpportunities[0].suggestedRent, 1050);
  assert.equal(r.renewalOpportunities[1].suggestedRent, 1020);
  assert.equal(r.totals.raisedLast12Mo, 50);
});

test('demo data produces a coherent funnel', () => {
  const m = leasingMetrics(demoData(), { days: 90 });
  const k = m.kpis;
  assert.ok(k.leads >= k.screened && k.screened >= k.qualified && k.qualified >= k.leased && k.leased > 0);
});
