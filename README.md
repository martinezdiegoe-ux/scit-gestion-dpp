# SCIT Gestión DPP

Aplicación React/Vite de la Dirección de Planificación y Proyectos del Servicio de Catastro e Información Territorial de Santa Fe. Los datos se consultan en Supabase; no se muestran registros ficticios.

## Funciones

- Pasantías: 47 cupos fijos (S01–S24 en Santa Fe y R01–R23 en Rosario), pasantes, antecedentes normativos, designaciones, historial, convenio inicial de 12 meses, renovación única de 6 meses, cierre de asignaciones y alertas de vencimiento a 120/90/60/30 días.
- Banco de Proyectos: cartera, tablero Kanban, límite WIP de cinco tareas en proceso, responsables, fechas, dependencias con protección contra ciclos, objetivos y resultados clave (OKR), indicadores, riesgos e hitos.
- Agenda de comunicación: acciones, fechas, responsables, canales y aprobación.
- Usuarios: invitación por correo a cargo del Director, roles y desactivación de perfiles. Cada invitado ingresa inicialmente con permiso de solo lectura.
- Auditoría: cambios de proyectos, pasantías, comunicación, perfiles y dependencias, visibles únicamente para el Director.

## Desarrollo y despliegue

Usar Node.js 22. Ejecutar npm ci y npm run dev. npm run build comprueba TypeScript y genera la PWA. El repositorio incluye .env.production con la URL y la clave publicable de este proyecto; nunca colocar una clave secreta o service_role en el cliente. Para otros entornos, configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local.

Las nueve migraciones en supabase/migrations corresponden a las ya aplicadas al proyecto iwouqdqoaurhqxdulnxh; no ejecutar de nuevo las migraciones históricas sobre ese proyecto. Para una base nueva, aplicarlas en orden. La función supabase/functions/invite-user/index.ts está desplegada con validación JWT y comprueba en el servidor que el solicitante sea Director activo.

El flujo de GitHub Actions compila y despliega GitHub Pages desde main. En Settings → Pages → Build and deployment, la fuente debe ser GitHub Actions. En Supabase Auth → URL Configuration, agregar https://martinezdiegoe-ux.github.io/scit-gestion-dpp/ como URL de redirección de invitación y recuperación de contraseña.

## Primer acceso

El proyecto todavía no tiene usuarios Auth. Crear el primer usuario en Supabase Authentication → Users (o invitarlo desde el panel). El trigger crea automáticamente un perfil lectura. Después de verificar su identidad, asignar el rol inicial de Director en SQL Editor:

    update public.profiles
    set role = 'director'
    where id = (select id from auth.users where email = 'CORREO_INSTITUCIONAL_VERIFICADO');

No promover por correo sin verificar la cuenta correcta. A partir de allí, el Director puede invitar otros usuarios y asignarles roles desde la aplicación. No se eliminaron ni reemplazaron los 47 cupos institucionales.

## Permisos

Las políticas RLS exigen perfil activo para leer datos. Director, Coordinador y Administrativo pueden cargar y actualizar; solo Director puede borrar y administrar perfiles. Solo lectura consulta. Las operaciones de pasantías se ejecutan en transacciones de la base y sus triggers impiden superposiciones, segundas renovaciones y plazos superiores a 12 + 6 meses. Las vistas de alertas usan security_invoker.

La función de invitación envía correo sólo cuando el Director pulsa Invitar usuario. No se ha enviado invitación ni creado cuenta durante esta actualización.
