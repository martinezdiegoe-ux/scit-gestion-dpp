import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const originalWindow = globalThis.window;
globalThis.window = { location: { hash: '', search: '' }, localStorage: { length: 0, key() { return null; } } };
const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'silent' });
try {
  const { latestSnapshotsThrough, sumMetrics, functionalUnitSeries } = await server.ssrLoadModule('/src/lib/cadastralStats.ts');
  const { TopicDetails } = await server.ssrLoadModule('/src/CadastralStats.tsx');
  const { managementRows } = await server.ssrLoadModule('/src/lib/cadastralManagement.ts');
  const snapshot = (source, cut_date, payload = {}) => ({ source, cut_date, payload });

  test('certificates open with stored regional functional-unit periods in every regional filter', () => {
    const weekly = metrics => ({ balance: [{ period: '24/11/2026', metrics }],
      stages: [], delayedStages: [], flow: [], stageDiscrepancies: [] });
    const row = snapshot('situation', '2026-11-24', {
      paid: weekly([{ label: 'Vencidas', north: 316, south: 73 }, { label: 'En término', north: 574, south: 337 }]),
      unpaid: weekly([{ label: 'Vencidas', north: 463, south: 852 }, { label: 'En término', north: 493, south: 573 }]),
      inPerson: [], certificateNotes: [],
      // Forma persistida en el corte del 24/11 que antes hacía fallar SeriesTable.
      functionalUnits: [
        { date: '2026-11-16', period: '16/11/2026', north: 231, south: 812 },
        { date: '2026-11-24', period: '24/11/2026', north: 227, south: 701 },
      ],
    });
    const original = structuredClone(row);
    for (const [region, total, units] of [['all', '3.681', '928'], ['north', '1.846', '227'], ['south', '1.835', '701']]) {
      const html = renderToStaticMarkup(React.createElement(TopicDetails, {
        topic: 'certificates', rows: [row], region, open() {}, archive: [row], cutDate: row.cut_date,
      }));
      assert.ok(html.includes(`<strong>${total}</strong>`));
      assert.match(html, /Unidades funcionales en proceso/);
      assert.match(html, /Solicitudes en proceso/);
      assert.ok(html.includes(`<td>${units}</td>`));
    }
    assert.deepEqual(row, original, 'rendering must not change stored statistics');
  });

  test('functional-unit series preserve imported metrics and empty historical series', () => {
    const imported = [{ date: '2026-11-24', period: '24/11/2026',
      metrics: [{ label: 'Solicitudes en proceso', north: 227, south: 701 }] }];
    assert.deepEqual(functionalUnitSeries(imported), imported);
    assert.deepEqual(functionalUnitSeries([]), []);
    assert.deepEqual(functionalUnitSeries([{ date: '2026-11-24', period: '24/11/2026', north: 227, south: 701 }]), imported);
  });

  test('partial weekly loads keep the latest available value of every source', () => {
    const prior = snapshot('situation', '2026-11-16', { digitalPlans: { north: 244, south: 532 }, mensuras: [{ north: 2, south: 3 }] });
    const archive = [snapshot('vep', '2026-11-24'), prior, snapshot('fac_north', '2026-11-23', { total: 206 }),
      snapshot('fac_south', '2026-11-23', { total: 274 }), snapshot('fac_north', '2026-11-16', { total: 174 })];
    const selected = latestSnapshotsThrough(archive, '2026-11-24');
    assert.deepEqual(selected.map(row => [row.source, row.cut_date]), [
      ['situation', '2026-11-16'], ['fac_north', '2026-11-23'], ['fac_south', '2026-11-23'], ['vep', '2026-11-24'],
    ]);
    assert.equal(selected[0].payload.digitalPlans.north + selected[0].payload.digitalPlans.south, 776);
    assert.equal(sumMetrics(selected[0].payload.mensuras).north, 2);
    assert.equal(selected[1].payload.total + selected[2].payload.total, 480);
    assert.deepEqual(latestSnapshotsThrough(archive, '2026-11-16').map(row => row.cut_date), ['2026-11-16', '2026-11-16']);
  });

  test('management comparisons use each source and regional on its own dates', () => {
    const fac = (total, overdue) => ({ total, overdue, ages: { 3: total - 10, 8: 10 },
      reasons: [{ label: 'Plano de mensura', count: total }], states: [], surfaces: [] });
    const archive = [snapshot('fac_north', '2026-11-16', fac(174, 42)),
      snapshot('fac_south', '2026-11-16', fac(376, 159)),
      snapshot('vep', '2026-11-16', { pending: { north: 126, south: 111 } }),
      snapshot('fac_north', '2026-11-23', fac(206, 65)),
      snapshot('fac_south', '2026-11-23', fac(274, 127)),
      snapshot('vep', '2026-11-24', { pending: { north: 96, south: 91 } })];
    const rows = managementRows(archive, '2026-11-24');
    assert.deepEqual(rows.map(row => [row.source, row.region, row.date, row.previousDate, row.signal]), [
      ['FAC', 'north', '2026-11-23', '2026-11-16', 'red'],
      ['FAC', 'south', '2026-11-23', '2026-11-16', 'amber'],
      ['VEP', 'north', '2026-11-24', '2026-11-16', 'green'],
      ['VEP', 'south', '2026-11-24', '2026-11-16', 'green'],
    ]);
    assert.equal(rows[0].olderThanSeven, 10);
    assert.deepEqual(managementRows(archive, '2026-11-16').map(row => row.signal),
      ['unknown', 'unknown', 'unknown', 'unknown']);
  });

} finally {
  await server.close();
  globalThis.window = originalWindow;
}
