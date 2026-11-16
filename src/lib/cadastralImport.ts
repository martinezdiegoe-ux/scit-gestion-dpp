import { read, utils, type WorkBook } from 'xlsx';
import { formatDate, sumMetrics, type Metric, type Region, type Regional, type Snapshot, type Trend, type Weekly } from './cadastralStats';

type Cell = string | number | boolean | Date | null;
type Row = Cell[];
type Grid = Row[];
const dayMs = 86_400_000;

const clean = (cell: Cell | undefined) => String(cell ?? '').replace(/\s+/g, ' ').trim();
const normalized = (cell: Cell | undefined) => clean(cell).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const rowText = (row: Row) => row.map(clean).filter(Boolean).join(' ');
const number = (cell: Cell | undefined) => typeof cell === 'number' && Number.isFinite(cell) ? cell : null;

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}

function count(cell: Cell | undefined) {
  const n = number(cell);
  ensure(n !== null && Number.isSafeInteger(n) && n >= 0, 'Se esperaba una cantidad entera en el informe.');
  return n;
}

function date(cell: Cell | undefined, date1904 = false) {
  if (cell instanceof Date && Number.isFinite(cell.getTime())) {
    return [cell.getFullYear(), cell.getMonth() + 1, cell.getDate()].map(value => String(value).padStart(2, "0")).join("-");
  }
  if (typeof cell === 'number' && Number.isFinite(cell) && cell > 0 && cell < 100_000) {
    return new Date((Math.floor(cell) - (date1904 ? 24107 : 25569)) * dayMs).toISOString().slice(0, 10);
  }
  const text = clean(cell);
  const match = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  const iso = match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === iso ? iso : '';
}

function sheet(book: WorkBook, name: string): Grid {
  const key = book.SheetNames.find(key => normalized(key) === normalized(name));
  ensure(key, `Falta la hoja «${name}».`);
  return grid(book, key);
}

function grid(book: WorkBook, key: string): Grid {
  const ws = book.Sheets[key];
  const range = utils.decode_range(ws['!ref'] ?? 'A1');
  ensure(range.e.r < 80_000 && range.e.c < 128, `La hoja «${key}» supera el tamaño admitido.`);
  range.s = { r: 0, c: 0 };
  return utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: null, blankrows: true, range });
}

function start(rows: Grid, label: string, from = 0) {
  const index = rows.findIndex((row, i) => i >= from && normalized(row[0]).includes(normalized(label)));
  ensure(index >= 0, `Falta la sección «${label}».`);
  return index;
}

function alignRows(rows: Grid, startAt: number, endAt = rows.length) {
  const north = rows.findIndex((row, i) => i >= startAt && i < endAt && normalized(row[0]) === 'NORTE');
  ensure(north >= 0 && normalized(rows[north + 1]?.[0]) === 'SUR', 'Faltan las filas de Norte y Sur.');
  return [rows[north], rows[north + 1]] as const;
}

function series(rows: Grid, header: number, width: number, labels: string[], date1904: boolean, endAt?: number): Trend[] {
  const [north, south] = alignRows(rows, header + 1, endAt);
  return rows[header].flatMap((cell, col) => {
    if (col === 0 || (col - 1) % width !== 0 || !clean(cell)) return [];
    const iso = date(cell, date1904);
    return [{ period: iso ? formatDate(iso) : clean(cell), date: iso || undefined,
      metrics: labels.map((label, index) => ({ label, north: count(north[col + index]), south: count(south[col + index]) })) }];
  });
}

function sectionStages(rows: Grid, header: number, cut: string, date1904: boolean): Metric[] {
  const col = rows[header].findIndex((cell, index) => index > 0 && date(cell, date1904) === cut);
  ensure(col > 0, 'La fecha de corte no coincide con el desglose por etapa.');
  const first = header + 2;
  const end = start(rows, 'Total Regional', first);
  return rows.slice(first, end).filter(row => clean(row[0])).map(row => ({
    label: clean(row[0]), north: count(row[col]), south: count(row[col + 1]),
  }));
}

function weeks(rows: Grid, cut: string, date1904: boolean, flow: 'fac' | 'daily' | null): Weekly {
  const balance = series(rows, start(rows, 'Regional'), 2, ['Vencidas', 'En término'], date1904);
  ensure(balance.at(-1)?.date === cut, 'El último corte de la tabla no coincide con la fecha del informe.');
  const byStage = start(rows, 'según etapa');
  const byDelay = start(rows, 'con demora mayor', byStage + 1);
  const marks = flow === 'fac' ? ['Ingresadas', 'Aprobadas', 'Rechazadas', 'Observadas'] : ['Ingresadas', 'Aprobadas'];
  const stageDiscrepancies = balance.flatMap(period => {
    if (!period.date) return [];
    const reported = sumMetrics(period.metrics);
    const stages = sumMetrics(sectionStages(rows, byStage + 1, period.date, date1904));
    return reported.north === stages.north && reported.south === stages.south ? [] : [{
      period: period.period, date: period.date, metrics: [
        { label: 'Vencidas + en término', ...reported }, { label: 'Suma por etapa', ...stages },
      ],
    }];
  });
  const flowHeader = flow && start(rows, flow === 'fac' ? 'Total Semanal de FORMULARIOS' : 'Promedio diario de Solicitudes');
  return {
    balance,
    stages: sectionStages(rows, byStage + 1, cut, date1904),
    stageDiscrepancies,
    delayedStages: sectionStages(rows, byDelay + 1, cut, date1904),
    flow: flowHeader ? series(rows, start(rows, 'Regional', flowHeader + 1), marks.length, marks, date1904) : [],
  };
}

function metricsFromRows(rows: Grid): Metric[] {
  return rows.map(row => ({ label: clean(row[0]), north: count(row[1]), south: count(row[2]) }));
}

function regionalLine(rows: Grid, label: string): Regional {
  const row = rows[start(rows, label)];
  return { north: count(row[1]), south: count(row[2]) };
}

function assertTotal(items: Metric[], declared: Regional, name: string) {
  const totals = sumMetrics(items);
  ensure(totals.north === declared.north && totals.south === declared.south, `El detalle de ${name} difiere de su total.`);
}

function situation(book: WorkBook): Snapshot {
  const paid = sheet(book, 'FOTO CCW PAGOS');
  const unpaid = sheet(book, 'FOTO CCW IMPAGOS');
  const fac = sheet(book, 'FOTO FAC');
  const precec = sheet(book, 'FOTO PRECEC');
  const plans = sheet(book, 'Planos Mensuras');
  const cut_date = date(paid[1][0]);
  ensure(cut_date && [unpaid[1][0], fac[1][0], precec[1][0], plans[0][0]].every(cell => date(cell) === cut_date),
    'Las hojas del estado de situación tienen fechas de corte distintas.');
  const date1904 = Boolean(book.Workbook?.WBProps?.date1904);
  const mensuras = metricsFromRows(plans.slice(2, start(plans, 'Total', 2)));
  assertTotal(mensuras, regionalLine(plans, 'Total'), 'mensuras');
  const inPerson = start(paid, 'Certificados Presenciales EMITIDOS');
  const functionalUnits = start(paid, 'Unidades Funcionales');
  const noteLabels = ['Certificados por VEP vencidos', 'Certificados por VEP en término', 'Perimidas por falta de pago'];
  const certificateNotes = paid.flatMap(row => {
    const index = ['CERTIFICADOS POR VEP VENCIDOS', 'CERTIFICADOS POR VEP EN TERMINO', 'SOLICITUDES PERIMIDAS POR FALTA DE PAGO']
      .findIndex(prefix => normalized(row[0]).startsWith(prefix));
    if (index < 0) return [];
    const match = clean(row[0]).match(/:\s*(\d+)\s*\(\s*(?:R\.\s*)?Norte\s*(\d+)\s*-\s*(?:(?:R\.\s*)?Sur\s*(\d+)|(\d+)\s*(?:R\.\s*)?Sur)/i)
      ?? clean(row[0]).match(/:\s*(\d+)\s*\(\s*(\d+)\s*(?:R\.\s*)?Norte\s*-\s*(\d+)\s*(?:R\.\s*)?Sur/i);
    if (!match) return [];
    const north = Number(match[2]), south = Number(match[3] ?? match[4]);
    ensure(north + south === Number(match[1]), 'Una observación de certificados no coincide con su total.');
    return [{ label: noteLabels[index], north, south }];
  });
  return { source: 'situation', cut_date, payload: {
    fac: weeks(fac, cut_date, date1904, 'fac'),
    paid: weeks(paid, cut_date, date1904, 'daily'),
    unpaid: weeks(unpaid, cut_date, date1904, null),
    precec: weeks(precec, cut_date, date1904, 'daily'),
    inPerson: series(paid, start(paid, 'Regional', inPerson + 1), 2, ['Promedio diario', 'Total semanal'], date1904, functionalUnits),
    functionalUnits: series(paid, start(paid, 'Regional', functionalUnits + 1), 1, ['Solicitudes en proceso'], date1904),
    certificateNotes,
    mensuras,
    digitalPlans: regionalLine(plans, 'CANTIDAD DE PLANOS PENDIENTES SCIT'),
    veps: regionalLine(plans, 'CANTIDAD VEP PENDIENTES SCIT'),
  }};
}

const stateNames: Record<string, string> = {
  PRESENTADA: 'Presentada', CONFIRMADA: 'Confirmada', PROCESADA: 'Procesada', 'EN PROCESO': 'En proceso', OBSERVADA: 'Observada',
};
const facReasons: Record<string, string> = {
  'VERIFICACION ESTADO PARCELARIO': 'Verificación de estado parcelario (VEP)',
  'PLANO DE MENSURA': 'Plano de mensura',
  'PLANO DE MENSURA URGENTE': 'Plano de mensura urgente',
  'PLANO DE MENSURA P.HORIZONTAL': 'Plano de mensura de propiedad horizontal',
  'PLANO DE MENSURA C.INMOB.': 'Conjunto inmobiliario',
  'PRESENTACION ESPONTANEA': 'Presentación espontánea',
  'PRESENTACION ESPONTANEA - UNIFICACION': 'Presentación espontánea',
  'ACT. DE CONSTRUCCIONES': 'Actualización de construcciones',
  'RECONSIDERACION DE AVALUOS': 'Reconsideración de avalúos',
  'MYC - PRESENTACION ESPONTANEA': 'MYC – Presentación espontánea',
};

function facDetail(book: WorkBook): Snapshot {
  const summary = sheet(book, 'Resumen');
  const cut_date = date(summary.find(row => normalized(rowText(row)).includes('SOLICITUDES DE FAC PENDIENTES'))?.find(cell => date(cell)));
  const region = summary.flat().map(normalized).find(cell => cell === 'NORTE' || cell === 'SUR');
  const header = summary.findIndex(row => row.some(cell => normalized(cell) === 'CANT. FAC'));
  ensure(cut_date && region && header >= 0, 'El resumen FAC debe indicar fecha, regional y cantidad.');
  const totalRow = summary.slice(header + 1).find(row => row.some(cell => normalized(cell) === 'TOTAL'));
  const quantityColumn = summary[header].findIndex(cell => normalized(cell) === 'CANT. FAC');
  ensure(totalRow, 'No se encontró el total del resumen FAC.');
  const total = count(totalRow[quantityColumn]);
  const detailSheets = book.SheetNames.filter(name => /^FAC PENDIENTES|^FAC_PENDIENTES|^PLANO DE MENSURA URGENTE$|^VEP$/.test(normalized(name)));
  ensure(detailSheets.length, 'Faltan las hojas con el detalle de solicitudes FAC.');
  let overdue = 0, dueToday = 0, reentries = 0;
  const reasons = new Map<string, { label: string; count: number; oldest: string }>();
  const states = new Map<string, number>();
  const ages: Record<string, number> = {};
  const surfaces = ['Sup. Exis.', 'Sup. Demol', 'Sup. SCIT'].map(label => ({ label, records: 0, value: 0 }));
  const seen = new Set<string>();
  const date1904 = Boolean(book.Workbook?.WBProps?.date1904);
  for (const name of detailSheets) {
    const rows = grid(book, name);
    const headings = ['SOLICITUD', 'F.SOLIC', 'F.TOPE', 'NRO.REINGRESO', 'ESTADO', 'SUP. EXIS.', 'SUP. DEMOL', 'SUP. SCIT', 'MOTIVO'];
    const indices = headings.map(heading => rows[0].findIndex(cell => normalized(cell) === heading));
    ensure(indices.every(index => index >= 0), `El detalle FAC de «${name}» tiene columnas faltantes.`);
    for (const row of rows.slice(1)) {
      const [id, request, due, reentry, state, existing, demolition, scit, reason] = indices.map(index => row[index]);
      if (!/^\d+$/.test(clean(id))) continue;
      if (seen.has(clean(id))) continue;
      seen.add(clean(id));
      const requested = date(request, date1904), deadline = date(due, date1904);
      ensure(requested && requested <= cut_date && deadline && clean(state) && clean(reason),
        'Hay solicitudes FAC con fechas o datos obligatorios inválidos.');
      const age = (Date.parse(cut_date) - Date.parse(requested)) / dayMs;
      ages[age] = (ages[age] ?? 0) + 1;
      if (deadline < cut_date) overdue++;
      if (deadline === cut_date) dueToday++;
      if ((number(reentry) ?? 0) > 1) reentries++;
      const stateLabel = stateNames[normalized(state)] ?? clean(state);
      states.set(stateLabel, (states.get(stateLabel) ?? 0) + 1);
      const reasonLabel = facReasons[normalized(reason)] ?? clean(reason);
      const entry = reasons.get(reasonLabel) ?? { label: reasonLabel, count: 0, oldest: requested };
      entry.count++;
      if (requested < entry.oldest) entry.oldest = requested;
      reasons.set(reasonLabel, entry);
      [existing, demolition, scit].forEach((cell, i) => {
        const area = number(cell);
        if (area === null) return;
        surfaces[i].records++;
        surfaces[i].value += area;
      });
    }
  }
  ensure(seen.size === total, 'El total FAC del resumen difiere de la cantidad de solicitudes únicas del detalle.');
  return { cut_date, source: region === 'NORTE' ? 'fac_north' : 'fac_south', payload: {
    total, overdue, dueToday, reentries, ages, reasons: [...reasons.values()],
    states: [...states].map(([label, count]) => ({ label, count })), surfaces,
  }};
}

function vep(book: WorkBook): Snapshot {
  const digital = sheet(book, 'VEP_Libro Digital');
  const lots = sheet(book, 'Lotes para VEP');
  const ste = sheet(book, 'STE');
  const cut_date = date(digital[0][0]);
  ensure(cut_date && [lots[0][0], ste[0][0]].every(cell => date(cell) === cut_date), 'Las hojas de VEP tienen fechas de corte distintas.');
  const lotLabels: Record<string, string> = { PRESENTADA: 'Presentadas', OBSERVADA: 'Observadas', 'EN PROCESO': 'En proceso' };
  const lotStates = metricsFromRows(lots.slice(1, start(lots, 'Total', 1)))
    .map(item => ({ ...item, label: lotLabels[normalized(item.label)] ?? item.label }));
  assertTotal(lotStates, regionalLine(lots, 'Total'), 'lotes para VEP');
  const rows: Regional = { north: 0, south: 0 };
  const ids: Record<Region, Set<string>> = { north: new Set(), south: new Set() };
  const byDay = new Map<string, Metric>(), byYear = new Map<string, Metric>();
  const headings = ['NRO SOLICITUD', 'FECHA SOLICITUD', 'REGIONAL', 'AÑO PLANO'].map(normalized);
  const indices = headings.map(heading => ste[1].findIndex(cell => normalized(cell) === heading));
  ensure(indices.every(index => index >= 0), 'La hoja STE tiene columnas faltantes.');
  const bump = (map: Map<string, Metric>, label: string, region: Region) => {
    const item = map.get(label) ?? { label, north: 0, south: 0 };
    item[region]++;
    map.set(label, item);
  };
  const date1904 = Boolean(book.Workbook?.WBProps?.date1904);
  for (const row of ste.slice(2)) {
    const [id, requested, zone, year] = indices.map(index => row[index]);
    if (!/^\d+$/.test(clean(id))) continue;
    const requestDate = date(requested, date1904);
    const regional = normalized(zone);
    ensure(requestDate && requestDate <= cut_date && (regional === 'NORTE' || regional === 'SUR'), 'La hoja STE tiene fechas o regionales inválidas.');
    const region = regional === 'NORTE' ? 'north' : 'south';
    rows[region]++;
    ids[region].add(clean(id));
    bump(byDay, requestDate, region);
    const y = Number(clean(year));
    bump(byYear, y >= 1800 && y <= Number(cut_date.slice(0, 4)) ? `${Math.floor(y / 10) * 10}–${Math.floor(y / 10) * 10 + 9}` : 'Sin año válido', region);
  }
  const ordered = (items: Map<string, Metric>) => [...items.values()].sort((a, b) => a.label.localeCompare(b.label));
  return { cut_date, source: 'vep', payload: {
    pending: regionalLine(digital, 'CANTIDAD VEP PENDIENTES SCIT'),
    lotStates,
    steRows: rows,
    steRequests: { north: ids.north.size, south: ids.south.size },
    steByDay: ordered(byDay).map(item => ({ ...item, label: formatDate(item.label) })),
    steByPlanAge: ordered(byYear),
  }};
}

export function parseCadastralWorkbook(buffer: ArrayBuffer | Uint8Array): Snapshot {
  const book = read(buffer, { cellFormula: false, cellHTML: false, cellStyles: false });
  const names = book.SheetNames.map(normalized);
  if (names.includes('FOTO CCW PAGOS')) return situation(book);
  if (names.includes('RESUMEN')) return facDetail(book);
  if (names.includes('LOTES PARA VEP')) return vep(book);
  throw Error('Formato no reconocido. Seleccioná un informe de Estado de situación, FAC pendientes o VEP y lotes.');
}
