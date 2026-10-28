alter table public.profiles add column if not exists position_title text;
update public.profiles set position_title='Jefe de Departamento Comunicación e Interacción Interna y Externa' where full_name='Juan Pablo Marin' and role='director';
update public.profiles set position_title='Director de Planificación y Proyectos' where full_name='Diego Eduardo Martinez' and role='director';
