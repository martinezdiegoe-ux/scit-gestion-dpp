create index if not exists ia_intern_idx on public.internship_assignments(intern_id);
create index if not exists ia_designation_act_idx on public.internship_assignments(designation_act_id);
create index if not exists ia_vacancy_act_idx on public.internship_assignments(vacancy_act_id);
create index if not exists ia_call_act_idx on public.internship_assignments(call_act_id);
create index if not exists ia_predecessor_idx on public.internship_assignments(predecessor_assignment_id);
create index if not exists it_act_idx on public.internship_terms(act_id);
create index if not exists pi_project_idx on public.project_indicators(project_id);
create index if not exists pm_project_idx on public.project_milestones(project_id);
create index if not exists po_project_idx on public.project_objectives(project_id);
create index if not exists pr_project_idx on public.project_risks(project_id);
create index if not exists ptd_dependency_idx on public.project_task_dependencies(depends_on_id);
create index if not exists pt_assignee_idx on public.project_tasks(assignee_id);
drop policy if exists profile_self on public.profiles;
create policy profile_self on public.profiles for select to authenticated
using (id=(select auth.uid()) or (select public.my_role())='director');
