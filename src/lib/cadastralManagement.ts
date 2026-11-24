import type { FacDetail, Region, Snapshot, VepData } from './cadastralStats';

export type ManagementRow = {
  source: 'FAC' | 'VEP'; region: Region; date: string; previousDate?: string;
  pending: number; previousPending?: number; overdue?: number; previousOverdue?: number;
  olderThanSeven?: number; topReasons?: { label: string; count: number }[];
  signal: 'red' | 'amber' | 'green' | 'unknown';
};

export function managementRows(archive: Snapshot[], through: string): ManagementRow[] {
  const recent = (source: Snapshot['source']) => archive.filter(row => row.source === source && row.cut_date <= through)
    .sort((a, b) => b.cut_date.localeCompare(a.cut_date));
  const fac = (source: 'fac_north' | 'fac_south', region: Region): ManagementRow | null => {
    const snapshots = recent(source);
    if (!snapshots.length) return null;
    const current = snapshots[0].payload as FacDetail;
    const prior = snapshots.find(row => row.cut_date < snapshots[0].cut_date);
    const previous = prior?.payload as FacDetail | undefined;
    return { source: 'FAC', region, date: snapshots[0].cut_date, previousDate: prior?.cut_date,
      pending: current.total, previousPending: previous?.total, overdue: current.overdue,
      previousOverdue: previous?.overdue,
      olderThanSeven: Object.entries(current.ages).reduce((sum, [age, count]) => sum + (+age > 7 ? count : 0), 0),
      topReasons: [...current.reasons].sort((a, b) => b.count - a.count).slice(0, 3),
      signal: previous ? current.overdue > previous.overdue ? 'red' : current.overdue > 0 ? 'amber' : 'green' : 'unknown' };
  };
  const vepSnapshots = recent('vep');
  const vep = (region: Region): ManagementRow | null => {
    if (!vepSnapshots.length) return null;
    const current = vepSnapshots[0].payload as VepData;
    const prior = vepSnapshots.find(row => row.cut_date < vepSnapshots[0].cut_date);
    const previous = prior?.payload as VepData | undefined;
    const pending = current.pending[region], previousPending = previous?.pending[region];
    return { source: 'VEP', region, date: vepSnapshots[0].cut_date, previousDate: prior?.cut_date,
      pending, previousPending,
      signal: previousPending === undefined ? 'unknown' : pending > previousPending ? 'red' : pending === previousPending ? 'amber' : 'green' };
  };
  return [fac('fac_north', 'north'), fac('fac_south', 'south'), vep('north'), vep('south')]
    .filter((row): row is ManagementRow => row !== null);
}
