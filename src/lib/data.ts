import { supabase } from './supabase';

export type Row = Record<string, any>;
export type DataState = {
  slots: Row[]; interns: Row[]; assignments: Row[]; terms: Row[]; acts: Row[];
  projects: Row[]; tasks: Row[]; objectives: Row[]; keyResults: Row[];
  indicators: Row[]; risks: Row[]; milestones: Row[]; dependencies: Row[];
  communication: Row[]; profiles: Row[]; audit: Row[]; alerts: Row[];
};
export const emptyData: DataState = {
  slots: [], interns: [], assignments: [], terms: [], acts: [],
  projects: [], tasks: [], objectives: [], keyResults: [], indicators: [],
  risks: [], milestones: [], dependencies: [], communication: [],
  profiles: [], audit: [], alerts: []
};
const tables: Record<keyof DataState, string> = {
  slots:'internship_slots', interns:'interns', assignments:'internship_assignments',
  terms:'internship_terms', acts:'normative_acts', projects:'projects',
  tasks:'project_tasks', objectives:'project_objectives', keyResults:'project_key_results',
  indicators:'project_indicators', risks:'project_risks', milestones:'project_milestones',
  dependencies:'project_task_dependencies', communication:'communication_items',
  profiles:'profiles', audit:'audit_log', alerts:'internship_term_alerts'
};
export async function loadData(isDirector: boolean): Promise<DataState> {
  if (!supabase) throw new Error('Falta la configuración de Supabase');
  const client = supabase;
  const keys = (Object.keys(tables) as (keyof DataState)[]).filter(k => isDirector || k !== 'audit');
  const results = await Promise.all(keys.map(async key => {
    const order = key === 'slots' ? 'code' : key === 'alerts' ? 'end_date' :
      key === 'milestones' ? 'due_date' : key === 'dependencies' ? 'task_id' : 'created_at';
    const { data, error } = await client.from(tables[key]).select('*')
      .order(order, { ascending: key !== 'audit' && key !== 'alerts', nullsFirst: false });
    // La vista de alertas carece de created_at; se ordena por vencimiento.
    if (error) throw new Error(tables[key] + ': ' + error.message);
    return [key, data || []] as const;
  }));
  return { ...emptyData, ...Object.fromEntries(results) };
}
export async function save(table: string, row: Row, id?: string) {
  if (!supabase) throw new Error('Supabase sin configurar');
  const query = id ? supabase.from(table).update(row).eq('id', id) : supabase.from(table).insert(row);
  const { error } = await query;
  if (error) throw error;
}
export async function call(name: string, args: Row) {
  if (!supabase) throw new Error('Supabase sin configurar');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
export function addMonthsLessDay(date: string, months: number) {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, d));
  if (target.getUTCDate() !== d) {
    // PostgreSQL interval ajusta los fines de mes al último día disponible.
    target.setUTCDate(0);
  }
  target.setUTCDate(target.getUTCDate() - 1);
  return target.toISOString().slice(0, 10);
}
export function daysRemaining(date?: string) {
  if (!date) return null;
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.parse(date + 'T00:00:00Z') - start) / 86400000);
}
