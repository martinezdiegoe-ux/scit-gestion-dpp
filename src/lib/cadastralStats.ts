export type Region = 'north' | 'south';
export type RegionFilter = Region | 'all';
export type Regional = Record<Region, number>;
export type Metric = Regional & { label: string };
export type Trend = { period: string; date?: string; metrics: Metric[] };
export type Surface = { label: string; records: number; value: number };
export type FacDetail = {
  total: number;
  overdue: number;
  dueToday: number;
  reentries: number;
  ages: Record<string, number>;
  reasons: { label: string; count: number; oldest: string }[];
  states: { label: string; count: number }[];
  surfaces: Surface[];
};
export type Weekly = {
  balance: Trend[];
  stages: Metric[];
  delayedStages: Metric[];
  flow: Trend[];
  stageDiscrepancies: Trend[];
};
export type Situation = {
  fac: Weekly;
  paid: Weekly;
  unpaid: Weekly;
  precec: Weekly;
  inPerson: Trend[];
  functionalUnits: Trend[];
  certificateNotes: Metric[];
  mensuras: Metric[];
  digitalPlans: Regional;
  veps: Regional;
};
export type VepData = {
  pending: Regional;
  lotStates: Metric[];
  steByDay: Metric[];
  steByPlanAge: Metric[];
  steRequests: Regional;
  steRows: Regional;
};
type SnapshotData = { situation: Situation; fac_north: FacDetail; fac_south: FacDetail; vep: VepData };
export type Source = keyof SnapshotData;
export type Snapshot = { [S in Source]: { cut_date: string; source: S; payload: SnapshotData[S] } }[Source];
export type Topic = 'summary' | 'management' | 'fac' | 'vep' | 'lots' | 'digital' | 'mensuras' | 'certificates' | 'precec';

export const sourceNames: Record<Source, string> = {
  situation: 'Estado de situación semanal',
  fac_north: 'FAC pendientes · Norte',
  fac_south: 'FAC pendientes · Sur',
  vep: 'VEP y lotes para VEP · STE',
};

export function latestSnapshotsThrough(archive: Snapshot[], cutDate: string): Snapshot[] {
  return (Object.keys(sourceNames) as Source[])
    .map(source => archive.filter(row => row.source === source && row.cut_date <= cutDate)
      .sort((a, b) => b.cut_date.localeCompare(a.cut_date))[0])
    .filter((row): row is Snapshot => Boolean(row));
}

export function value(item: Regional, region: RegionFilter) {
  return region === 'all' ? item.north + item.south : item[region];
}

export function sumMetrics(items: Regional[]) {
  return items.reduce<Regional>((sum, item) => ({
    north: sum.north + item.north, south: sum.south + item.south,
  }), { north: 0, south: 0 });
}

export function lastBalance(weekly?: Weekly) {
  return weekly?.balance.at(-1)?.metrics;
}

export function weekTotal(weekly?: Weekly) {
  const balance = lastBalance(weekly);
  return balance && sumMetrics(balance);
}

export function formatDate(iso: string) {
  return iso.split('-').reverse().join('/');
}
