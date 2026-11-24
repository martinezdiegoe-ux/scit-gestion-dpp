import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'silent' });
try {
  const { latestSnapshotsThrough, sumMetrics } = await server.ssrLoadModule('/src/lib/cadastralStats.ts');
  const snapshot = (source, cut_date, payload = {}) => ({ source, cut_date, payload });

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

} finally {
  await server.close();
}
