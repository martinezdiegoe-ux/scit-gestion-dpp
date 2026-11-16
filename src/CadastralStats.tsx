import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, BarChart3, ClipboardList, Files, FileCheck2, Map as MapIcon, Upload } from 'lucide-react';
import { formatDate, lastBalance, sourceNames, sumMetrics, value, weekTotal,
  type FacDetail, type Metric, type Regional, type RegionFilter, type Situation, type Snapshot, type Topic, type Trend, type VepData, type Weekly } from './lib/cadastralStats';
import { supabase } from './lib/supabase';
import './cadastralStats.css';

const topics = [
  { id: 'summary', name: 'Resumen', icon: BarChart3 },
  { id: 'fac', name: 'FAC', icon: ClipboardList },
  { id: 'vep', name: 'VEP', icon: FileCheck2 },
  { id: 'lots', name: 'Lotes para VEP · STE', icon: MapIcon },
  { id: 'digital', name: 'Libro Digital', icon: Files },
  { id: 'mensuras', name: 'Registración de planos', icon: MapIcon },
  { id: 'certificates', name: 'Certificados catastrales', icon: FileCheck2 },
  { id: 'precec', name: 'Precertificados', icon: ClipboardList },
] as const;
const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const nf = (n: number) => fmt.format(n);
const pct = (numerator: number, denominator: number) =>
  denominator > 0 ? `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, style: 'percent' }).format(numerator / denominator)}` : '—';
const metric = (label: string, item: Regional): Metric => ({ label, ...item });
const stagesByVolume = (items: Metric[], region: RegionFilter) =>
  [...items].sort((a, b) => value(b, region) - value(a, region));

function KPIs({ items }: { items: { label: string; amount: string; detail?: string }[] }) {
  return <div className="cadKpis">{items.map(({ label, amount, detail }) =>
    <div className="cadKpi" key={label}><span>{label}</span><strong>{amount}</strong>{detail && <small>{detail}</small>}</div>
  )}</div>;
}

function MetricTable({ items, region, label = 'Indicador' }: { items: Metric[]; region: RegionFilter; label?: string }) {
  return <div className="tablewrap cadTable"><table>
    <thead><tr><th scope="col">{label}</th>{region !== 'south' && <th scope="col">Norte</th>}
      {region !== 'north' && <th scope="col">Sur</th>}{region === 'all' && <th scope="col">Total</th>}</tr></thead>
    <tbody>{items.map(item => <tr key={item.label}><th scope="row">{item.label}</th>
      {region !== 'south' && <td>{nf(item.north)}</td>}{region !== 'north' && <td>{nf(item.south)}</td>}
      {region === 'all' && <td>{nf(value(item, 'all'))}</td>}</tr>)}</tbody>
  </table></div>;
}

function Bars({ items, region }: { items: Metric[]; region: RegionFilter }) {
  const max = Math.max(1, ...items.map(item => value(item, region)));
  return <div className="cadBars" aria-hidden="true">{items.map(item => <div key={item.label}>
    <div><span>{item.label}</span><b>{nf(value(item, region))}</b></div>
    <div className="cadTrack"><i style={{ width: `${region === 'south' ? 0 : item.north / max * 100}%` }} />
      <i style={{ width: `${region === 'north' ? 0 : item.south / max * 100}%` }} /></div>
  </div>)}{region === 'all' && <span className="cadBarKey"><span>Norte</span><span>Sur</span></span>}</div>;
}

function Panel({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return <section className="card cadPanel"><h3>{title}</h3>{note && <p>{note}</p>}{children}</section>;
}

function Breakdown({ title, items, region, note }: { title: string; items: Metric[]; region: RegionFilter; note?: string }) {
  return <Panel title={title} note={note}><Bars items={items} region={region} /><MetricTable items={items} region={region} /></Panel>;
}

function SeriesTable({ title, series, region, note, totals = false }: {
  title: string; series: Trend[]; region: RegionFilter; note?: string; totals?: boolean;
}) {
  if (!series.length) return null;
  return <Panel title={title} note={note}><div className="tablewrap cadTable"><table>
    <thead><tr><th scope="col">Período</th>{series[0].metrics.map(item => <th scope="col" key={item.label}>{item.label}</th>)}
      {totals && <th scope="col">Total</th>}</tr></thead>
    <tbody>{series.map(({ period, metrics }) => <tr key={period}><th scope="row">{period}</th>
      {metrics.map(item => <td key={item.label}>{nf(value(item, region))}</td>)}
      {totals && <td>{nf(value(sumMetrics(metrics), region))}</td>}</tr>)}</tbody>
  </table></div></Panel>;
}

function WeeklyDetails({ title, weekly, region, days, flowTitle, flowNote }: {
  title: string; weekly: Weekly; region: RegionFilter; days: number; flowTitle?: string; flowNote?: string;
}) {
  const balance = lastBalance(weekly) ?? [];
  const total = value(sumMetrics(balance), region);
  const overdue = value(balance[0], region);
  const previous = weekly.balance.at(-2);
  const previousTotal = previous ? value(sumMetrics(previous.metrics), region) : null;
  const change = previousTotal === null ? null : total - previousTotal;
  return <>
    <h3 className="cadSectionTitle">{title}</h3>
    <KPIs items={[
      { label: 'En trámite', amount: nf(total) },
      { label: 'Vencidas según el informe', amount: nf(overdue), detail: `${pct(overdue, total)} de las solicitudes en trámite` },
      { label: 'En término según el informe', amount: nf(total - overdue) },
      ...(previous && change !== null ? [{ label: 'Variación desde el corte anterior', amount: `${change > 0 ? '+' : ''}${nf(change)}`, detail: previous.period }] : []),
    ]} />
    <div className="cadColumns">
      <Breakdown title="Solicitudes por etapa o área" items={stagesByVolume(weekly.stages, region)} region={region} />
      <Breakdown title={`Demora mayor a ${days} días por etapa o área`} items={stagesByVolume(weekly.delayedStages, region)} region={region} />
    </div>
    <div className="cadColumns">
      <SeriesTable title="Evolución de solicitudes en trámite" series={weekly.balance} region={region} totals />
      {flowTitle && <SeriesTable title={flowTitle} series={weekly.flow} region={region} note={flowNote} />}
    </div>
    <SeriesTable title="Diferencias entre tablas del informe" series={weekly.stageDiscrepancies.filter(period =>
      value(period.metrics[0], region) !== value(period.metrics[1], region))} region={region}
      note="Para el saldo en trámite se usa la tabla de vencidas y en término." />
  </>;
}

function combineFac(north: FacDetail | undefined, south: FacDetail | undefined, field: 'reasons' | 'states') {
  const grouped = new Map<string, Metric & { oldestNorth?: string; oldestSouth?: string }>();
  for (const [region, detail] of [['north', north], ['south', south]] as const) {
    for (const item of detail?.[field] ?? []) {
      const row = grouped.get(item.label) ?? { label: item.label, north: 0, south: 0 };
      row[region] = item.count;
      if ('oldest' in item) row[region === 'north' ? 'oldestNorth' : 'oldestSouth'] = String(item.oldest);
      grouped.set(row.label, row);
    }
  }
  return [...grouped.values()];
}

function FacDetails({ weekly, north, south, region }: { weekly?: Weekly; north?: FacDetail; south?: FacDetail; region: RegionFilter }) {
  const details = [region === 'south' ? undefined : north, region === 'north' ? undefined : south]
    .filter((item): item is FacDetail => Boolean(item));
  const total = details.reduce((sum, item) => sum + item.total, 0);
  const ages = new Map<number, number>();
  for (const detail of details) {
    for (const [age, count] of Object.entries(detail.ages)) ages.set(+age, (ages.get(+age) ?? 0) + count);
  }
  let cumulative = 0;
  const medianRanks = [Math.floor((total + 1) / 2), Math.ceil((total + 1) / 2)];
  let median = 0;
  for (const [age, count] of [...ages].sort(([a], [b]) => a - b)) {
    median += age * medianRanks.filter(rank => cumulative < rank && rank <= cumulative + count).length / 2;
    cumulative += count;
  }
  const reasons = stagesByVolume(combineFac(north, south, 'reasons'), region).filter(row => value(row, region) > 0);
  const oldestByReason = combineFac(north, south, 'reasons')
    .filter(row => value(row, region) > 0).map(row => {
      const dates = [region !== 'south' ? row.oldestNorth : null, region !== 'north' ? row.oldestSouth : null]
        .filter((date): date is string => Boolean(date)).sort();
      return { label: row.label, date: dates[0], count: value(row, region) };
    }).sort((a, b) => a.date.localeCompare(b.date));
  const rangeCounts = (detail: FacDetail | undefined, min: number, max: number) =>
    Object.entries(detail?.ages ?? {}).reduce((sum, [age, count]) => +age >= min && +age <= max ? sum + count : sum, 0);
  const ageBands = [[0, 7, '0–7 días'], [8, 14, '8–14 días'], [15, 30, '15–30 días'], [31, Infinity, '31 días o más']] as const;
  const overdue = details.reduce((sum, detail) => sum + detail.overdue, 0);
  const dueToday = details.reduce((sum, detail) => sum + detail.dueToday, 0);
  const reentries = details.reduce((sum, detail) => sum + detail.reentries, 0);
  const weeklyTotals = weekTotal(weekly);
  const differentDetails = weeklyTotals && ((region !== 'south' && north && north.total !== weeklyTotals.north)
    || (region !== 'north' && south && south.total !== weeklyTotals.south));
  const surfaceRows = (details[0]?.surfaces ?? []).map(({ label }, index) => ({
    label,
    records: details.reduce((sum, detail) => sum + detail.surfaces[index].records, 0),
    area: details.reduce((sum, detail) => sum + detail.surfaces[index].value, 0),
  }));
  return <>
    {weekly && <WeeklyDetails title="Formularios de Actualización de Construcciones" weekly={weekly} region={region} days={2}
      flowTitle="Movimiento semanal de FAC" flowNote="Ingresos y resoluciones del período. Las aprobaciones pueden corresponder a ingresos de semanas anteriores." />}
    {details.length ? <>
      <h3 className="cadSectionTitle">Detalle de FAC pendientes</h3>
      {differentDetails && <p className="reportNotice">El total de la planilla de detalle difiere del informado en el estado de situación semanal.</p>}
      {region === 'all' && details.length < 2 && <p className="muted">El detalle cubre solamente la Regional {north ? 'Norte' : 'Sur'}.</p>}
      <KPIs items={[
        { label: 'Antigüedad mediana', amount: total ? `${nf(median)} días` : '—', detail: 'Días corridos al corte' },
        { label: 'Fecha tope anterior al corte', amount: nf(overdue), detail: `${pct(overdue, total)} de los FAC con detalle` },
        { label: 'Fecha tope en el día del corte', amount: nf(dueToday) },
        { label: 'Nro. de reingreso mayor a 1', amount: nf(reentries), detail: `${pct(reentries, total)} de los FAC con detalle` },
      ]} />
      <div className="cadColumns">
        <Breakdown title="Motivos de los FAC pendientes" items={reasons} region={region} />
        <div>
          <Panel title="Estado en el listado FAC"><MetricTable items={stagesByVolume(combineFac(north, south, 'states'), region)
            .filter(row => value(row, region) > 0)} region={region} /></Panel>
          <Breakdown title="Antigüedad desde la solicitud" items={ageBands.map(([min, max, label]) => ({
            label, north: rangeCounts(north, min, max), south: rangeCounts(south, min, max),
          }))} region={region} />
          <Panel title="Ingreso más antiguo por motivo"><div className="tablewrap cadTable"><table>
            <thead><tr><th scope="col">Motivo</th><th scope="col">Fecha</th><th scope="col">Pendientes</th></tr></thead>
            <tbody>{oldestByReason.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{formatDate(row.date)}</td><td>{nf(row.count)}</td></tr>)}</tbody>
          </table></div></Panel>
        </div>
      </div>
      <Panel title="Superficies consignadas en los FAC pendientes"
        note="Los m² incorporados requieren la superficie previa y la aprobada al cierre. Esta planilla describe solicitudes pendientes.">
        <div className="tablewrap cadTable"><table>
          <thead><tr><th scope="col">Campo de origen</th><th scope="col">Registros con dato</th><th scope="col">Suma de superficies</th></tr></thead>
          <tbody>{surfaceRows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{nf(row.records)} de {nf(total)}</td>
            <td>{row.records ? `${nf(row.area)} m²` : 'Sin dato'}</td></tr>)}</tbody>
        </table></div>
      </Panel>
    </> : <p className="muted">El corte no incluye detalle FAC para la selección.</p>}
  </>;
}

function readWorkbook(file: File, buffer: ArrayBuffer) {
  return new Promise<Snapshot>((resolve, reject) => {
    const worker = new Worker(new URL('./lib/cadastralImport.worker.ts', import.meta.url), { type: 'module' });
    const timer = window.setTimeout(() => finish(undefined, 'Se agotó el tiempo de lectura.'), 25_000);
    function finish(snapshot?: Snapshot, error?: string) {
      window.clearTimeout(timer);
      worker.terminate();
      if (snapshot) resolve(snapshot);
      else reject(Error(`${file.name}. ${error ?? 'No se pudo leer la planilla.'}`));
    }
    worker.onmessage = ({ data }: MessageEvent<{ snapshot?: Snapshot; error?: string }>) => finish(data.snapshot, data.error);
    worker.onerror = () => finish(undefined, 'No se pudo leer la planilla.');
    worker.postMessage(buffer, [buffer]);
  });
}

function UploadCuts({ save }: { save: (snapshots: Snapshot[]) => Promise<void> }) {
  const [pending, setPending] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function prepare(files: File[]) {
    setPending([]);
    setMessage('');
    setError('');
    if (!files.length) return;
    setBusy(true);
    try {
      if (files.length > 4 || files.some(file => file.size > 10 * 1024 * 1024 || !/\.(xls[x]?|ods)$/i.test(file.name))) {
        throw Error('Seleccioná hasta cuatro archivos XLS, XLSX u ODS de hasta 10 MB cada uno.');
      }
      const snapshots: Snapshot[] = [];
      for (const file of files) snapshots.push(await readWorkbook(file, await file.arrayBuffer()));
      if (new Set(snapshots.map(row => row.cut_date)).size !== 1) throw Error('Los archivos deben corresponder a la misma fecha de corte.');
      if (new Set(snapshots.map(row => row.source)).size !== snapshots.length) throw Error('Hay más de una planilla de la misma fuente.');
      setPending(snapshots);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo preparar el corte.');
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await save(pending);
      setMessage(`Corte del ${formatDate(pending[0].cut_date)} guardado.`);
      setPending([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el corte.');
    } finally {
      setBusy(false);
    }
  }
  return <details className="card cadUpload">
    <summary><Upload size={18} /> Cargar planillas</summary>
    <p>Seleccioná los informes del mismo corte. La aplicación guarda indicadores agregados. Si cargás otra vez una fuente para esa fecha, se actualizan sus datos.</p>
    <label>Archivos del corte <input type="file" accept=".xls,.xlsx,.ods" multiple disabled={busy}
      onChange={event => { const files = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = ''; void prepare(files); }} /></label>
    {busy && <p role="status">Procesando planillas…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!!pending.length && <div className="cadUploadPreview">
      <b>Corte del {formatDate(pending[0].cut_date)}</b>
      <ul>{pending.map(row => <li key={row.source}>{sourceNames[row.source]}</li>)}</ul>
      <button className="primary" disabled={busy} onClick={() => void confirm()}>Guardar corte</button>
    </div>}
  </details>;
}

function sameRegional(a: Regional, b: Regional) {
  return a.north === b.north && a.south === b.south;
}

function Summary({ situation, vep, north, south, region, open }: {
  situation?: Situation; vep?: VepData; north?: FacDetail; south?: FacDetail; region: RegionFilter; open: (topic: Topic) => void;
}) {
  const hasFacDetail = region === 'all' ? Boolean(north && south) : Boolean(region === 'north' ? north : south);
  const fac = weekTotal(situation?.fac) ?? (hasFacDetail
    ? { north: north?.total ?? 0, south: south?.total ?? 0 } : undefined);
  const vepTotal = vep?.pending ?? situation?.veps;
  const paid = weekTotal(situation?.paid), unpaid = weekTotal(situation?.unpaid);
  const cards: { id: Topic; label: string; item?: Regional; detail: string }[] = [
    { id: 'fac', label: 'FAC pendientes', item: fac, detail: 'Formularios de Actualización de Construcciones' },
    { id: 'vep', label: 'VEP pendientes', item: vepTotal, detail: 'Verificaciones de estado parcelario del informe SCIT' },
    { id: 'lots', label: 'Solicitudes de lotes para VEP', item: vep && sumMetrics(vep.lotStates), detail: 'Presentadas, observadas y en proceso' },
    { id: 'digital', label: 'Planos pendientes de Libro Digital', item: situation?.digitalPlans, detail: 'Planos pendientes SCIT' },
    { id: 'mensuras', label: 'Expedientes de mensura pendientes', item: situation && sumMetrics(situation.mensuras), detail: 'Inscripción por código de trámite' },
    { id: 'certificates', label: 'Certificados catastrales web en trámite', item: paid && unpaid && sumMetrics([paid, unpaid]), detail: 'Solicitudes pagadas e impagas' },
    { id: 'precec', label: 'Precertificados en trámite', item: weekTotal(situation?.precec), detail: 'Solicitudes PRECEC' },
  ];
  return <div className="cadTopicCards">{cards.map(card => <button key={card.id} onClick={() => open(card.id)}>
    <span>{card.label}</span><strong>{card.item ? nf(value(card.item, region)) : '—'}</strong><small>{card.detail}</small>
  </button>)}</div>;
}

const missingSource = <section className="card"><p>El corte seleccionado no incluye un informe para este tema.</p></section>;

function TopicDetails({ topic, rows, region, open, archive, cutDate }: {
  topic: Topic; rows: Snapshot[]; region: RegionFilter; open: (topic: Topic) => void; archive: Snapshot[]; cutDate: string;
}) {
  const situation = rows.find(row => row.source === 'situation')?.payload;
  const vep = rows.find(row => row.source === 'vep')?.payload;
  const north = rows.find(row => row.source === 'fac_north')?.payload;
  const south = rows.find(row => row.source === 'fac_south')?.payload;
  function history(getMetrics: (dateRows: Snapshot[]) => Metric[]) {
    const dates = [...new Set(archive.filter(row => row.cut_date <= cutDate).map(row => row.cut_date))].sort();
    return dates.map(date => ({ period: formatDate(date), metrics: getMetrics(archive.filter(row => row.cut_date === date)) }))
      .filter(period => period.metrics.length);
  }
  const pending = vep?.pending ?? situation?.veps;
  switch (topic) {
    case 'summary': return <Summary situation={situation} vep={vep} north={north} south={south} region={region} open={open} />;
    case 'fac': return <FacDetails weekly={situation?.fac} north={north} south={south} region={region} />;
    case 'vep': {
      if (!pending) return missingSource;
      const facVep = 'Verificación de estado parcelario (VEP)';
      const byCut = history(dateRows => {
        const vepCount = dateRows.find(row => row.source === 'vep')?.payload.pending
          ?? dateRows.find(row => row.source === 'situation')?.payload.veps;
        return vepCount ? [metric('VEP pendientes', vepCount)] : [];
      });
      return <>
        {vep && situation && !sameRegional(vep.pending, situation.veps) && <p className="reportNotice">Las fuentes difieren en la cantidad de VEP. Se muestra la cifra de la hoja VEP_Libro Digital.</p>}
        <Breakdown title="Verificaciones de estado parcelario" items={[metric('VEP pendientes SCIT', pending)]} region={region} />
        {((region !== 'south' && north) || (region !== 'north' && south)) &&
          <Panel title="FAC cuyo motivo es VEP" note={region === 'all' && (!north || !south)
            ? `Detalle disponible de la Regional ${north ? 'Norte' : 'Sur'}.`
            : 'Cantidad de formularios FAC asociados al motivo de verificación, medida en el listado FAC.'}>
            <MetricTable items={[metric('FAC con motivo VEP', {
              north: north?.reasons.find(item => item.label === facVep)?.count ?? 0,
              south: south?.reasons.find(item => item.label === facVep)?.count ?? 0,
            })]} region={region === 'all' && (!north || !south) ? north ? 'north' : 'south' : region} />
          </Panel>}
        {byCut.length > 1 && <SeriesTable title="Evolución de VEP pendientes" series={byCut} region={region} />}
      </>;
    }
    case 'lots': {
      if (!vep) return missingSource;
      const lots = value(sumMetrics(vep.lotStates), region);
      const observed = vep.lotStates.find(item => /^observad/i.test(item.label));
      return <>
        <KPIs items={[
          { label: 'Solicitudes de lotes informadas', amount: nf(lots) },
          { label: 'Observadas', amount: observed ? nf(value(observed, region)) : '—', detail: observed ? pct(value(observed, region), lots) : undefined },
          { label: 'Solicitudes únicas en el detalle STE', amount: nf(value(vep.steRequests, region)),
            detail: `${nf(value(vep.steRows, region))} filas informadas por STE` },
        ]} />
        <Breakdown title="Solicitudes de lotes por estado" items={vep.lotStates} region={region} />
        <div className="cadColumns">
          <Panel title="Filas del detalle STE por fecha de solicitud"><MetricTable items={vep.steByDay} region={region} label="Fecha" /></Panel>
          <Panel title="Filas del detalle STE por década del plano"><MetricTable items={vep.steByPlanAge} region={region} label="Década" /></Panel>
        </div>
      </>;
    }
    case 'digital': return situation || pending ? <>
      <Breakdown title="Libro Digital" items={[
        ...(situation ? [metric('Planos pendientes SCIT', situation.digitalPlans)] : []),
        ...(pending ? [metric('VEP pendientes SCIT', pending)] : []),
      ]} region={region} note="Pendientes por tipo de registro en Libro Digital. Los planos se informan en la hoja «Planos Mensuras»." />
    </> : missingSource;
    case 'mensuras': {
      if (!situation) return missingSource;
      const total = sumMetrics(situation.mensuras);
      const urgent = sumMetrics(situation.mensuras.filter(item => /urgente/i.test(item.label)));
      const byCut = history(dateRows => {
        const snapshot = dateRows.find(row => row.source === 'situation');
        return snapshot ? [metric('Expedientes pendientes', sumMetrics(snapshot.payload.mensuras))] : [];
      });
      return <>
        <KPIs items={[
          { label: 'Expedientes de mensura pendientes', amount: nf(value(total, region)) },
          { label: 'Trámites con código de urgencia', amount: nf(value(urgent, region)), detail: pct(value(urgent, region), value(total, region)) },
        ]} />
        <Breakdown title="Registración de planos por código de trámite" items={stagesByVolume(situation.mensuras, region)} region={region} />
        {byCut.length > 1 && <SeriesTable title="Evolución de expedientes de mensura pendientes" series={byCut} region={region} />}
      </>;
    }
    case 'certificates': {
      if (!situation) return missingSource;
      const paid = weekTotal(situation.paid)!, unpaid = weekTotal(situation.unpaid)!;
      const entries = value(situation.paid.flow.at(-1)?.metrics[0] ?? { north: 0, south: 0 }, region);
      const approvals = value(situation.paid.flow.at(-1)?.metrics[1] ?? { north: 0, south: 0 }, region);
      return <>
        <KPIs items={[
          { label: 'Certificados web en trámite', amount: nf(value(sumMetrics([paid, unpaid]), region)) },
          { label: 'Solicitudes sin pago', amount: nf(value(unpaid, region)), detail: pct(value(unpaid, region), value(sumMetrics([paid, unpaid]), region)) },
          { label: 'Promedio diario de ingresos / aprobaciones', amount: situation.paid.flow.length ? `${nf(entries)} / ${nf(approvals)}` : '—' },
        ]} />
        <WeeklyDetails title="Certificados web pagados" weekly={situation.paid} region={region} days={5}
          flowTitle="Ingresos y aprobaciones · promedio diario" flowNote="Las aprobaciones pueden corresponder a ingresos de semanas anteriores." />
        <WeeklyDetails title="Certificados web impagos" weekly={situation.unpaid} region={region} days={5} />
        <div className="cadColumns">
          <SeriesTable title="Certificados presenciales emitidos" series={situation.inPerson} region={region} />
          <SeriesTable title="Unidades funcionales en proceso" series={situation.functionalUnits} region={region} />
        </div>
        {situation.certificateNotes.length > 0 && <Panel title="Certificados por VEP y perimidos"><MetricTable items={situation.certificateNotes} region={region} /></Panel>}
      </>;
    }
    case 'precec': return situation ? <WeeklyDetails title="Precertificados catastrales (PRECEC)" weekly={situation.precec}
      region={region} days={10} flowTitle="Ingresos y aprobaciones · promedio diario" /> : missingSource;
  }
}

export default function CadastralStats({ back, canEdit }: { back: () => void; canEdit: boolean }) {
  const [archive, setArchive] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState('');
  const [topic, setTopic] = useState<Topic>('summary');
  const [region, setRegion] = useState<RegionFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      const snapshots: Snapshot[] = [];
      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const query = supabase.from('scit_report_cuts').select('cut_date,source,payload')
          .order('cut_date', { ascending: false }).order('source').range(offset, offset + pageSize - 1);
        const { data, error } = await (signal ? query.abortSignal(signal) : query);
        if (signal?.aborted) return;
        if (error) throw error;
        snapshots.push(...data as Snapshot[]);
        if (data.length < pageSize) break;
      }
      setArchive(snapshots);
    } catch {
      if (!signal?.aborted) setError('No se pudieron cargar los cortes. Volvé a intentar.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const dates = [...new Set(archive.map(row => row.cut_date))];
  const cutDate = dates.includes(selected) ? selected : dates[0];
  const rows = archive.filter(row => row.cut_date === cutDate);
  async function save(snapshots: Snapshot[]) {
    if (!supabase) throw Error('Falta conectar la base de datos.');
    const { error } = await supabase.from('scit_report_cuts').upsert(snapshots, { onConflict: 'cut_date,source' });
    if (error) throw Error('No se pudo guardar el corte. Revisá tu conexión y tus permisos.');
    setSelected(snapshots[0].cut_date);
    await load();
  }
  return <div className="cadStats">
    <section className="card cadHeader">
      <button className="ghost cadBack" onClick={back}><ArrowLeft size={16} /> Reportes</button>
      <h2>Estadísticas y datos</h2>
      <div className="cadControls">
        <label>Corte <select value={cutDate ?? ''} disabled={!cutDate} onChange={event => setSelected(event.target.value)}>
          {!cutDate && <option value="">Sin cortes</option>}
          {dates.map(date => <option key={date} value={date}>{formatDate(date)}</option>)}
        </select></label>
        <label>Regional <select value={region} onChange={event => setRegion(event.target.value as RegionFilter)}>
          <option value="all">Toda la provincia</option><option value="north">Norte</option><option value="south">Sur</option>
        </select></label>
      </div>
    </section>
    {canEdit && <UploadCuts save={save} />}
    {loading && <p className="muted" role="status">Cargando cortes…</p>}
    {error && <div className="card"><p className="error" role="alert">{error}</p><button className="ghost" onClick={() => void load()}>Reintentar</button></div>}
    {!loading && !error && !cutDate && <section className="card"><p>Todavía no se cargaron planillas.</p></section>}
    {cutDate && <><div className="cadTabs" role="group" aria-label="Temas estadísticos">{topics.map(({ id, name, icon: Icon }) =>
      <button key={id} aria-pressed={topic === id} onClick={() => setTopic(id)}><Icon size={16} />{name}</button>
    )}</div>
      <TopicDetails topic={topic} rows={rows} region={region} open={setTopic} archive={archive} cutDate={cutDate} />
      <p className="cadSources"><b>Fuentes del corte</b> · {rows.map(row => sourceNames[row.source]).join(' · ')}</p>
    </>}
  </div>;
}
