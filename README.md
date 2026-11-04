# SCIT Gestión DPP

Aplicación React/Vite de la Dirección de Planificación y Proyectos del Servicio de Catastro e Información Territorial de Santa Fe. Los datos se consultan en Supabase; no se muestran registros ficticios.

## Funciones

- Pasantías: 47 cupos fijos (S01–S24 en Santa Fe y R01–R23 en Rosario), pasantes, antecedentes normativos, designaciones, historial, convenio inicial de 12 meses, renovación única de 6 meses, cierre de asignaciones y alertas de vencimiento a 120/90/60/30 días.
- Banco de Proyectos: cartera, tablero Kanban, límite WIP de cinco tareas en proceso, responsables, fechas, dependencias con protección contra ciclos, objetivos y resultados clave (OKR), indicadores, riesgos e hitos.
- Agenda de comunicación: acciones, fechas, responsables, canales y aprobación.
- Usuarios: invitación por correo a cargo del Director, roles y desactivación de perfiles. Cada invitado queda pendiente hasta su activación por un Director y comienza con permiso de solo lectura.
- Auditoría: cambios de proyectos, pasantías, comunicación, perfiles y dependencias, visibles únicamente para el Director.

## Desarrollo y despliegue

Usar Node.js 22. Ejecutar npm ci y npm run dev. npm run build comprueba TypeScript y genera la PWA. El repositorio incluye .env.production con la URL y la clave publicable de este proyecto; nunca colocar una clave secreta o service_role en el cliente. Para otros entornos, configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local.

Las migraciones históricas en supabase/migrations corresponden a las ya aplicadas al proyecto iwouqdqoaurhqxdulnxh; no ejecutar de nuevo las migraciones históricas sobre ese proyecto. Para una base nueva, aplicarlas en orden. La función supabase/functions/invite-user/index.ts está desplegada con validación JWT y comprueba en el servidor que el solicitante sea Director activo.

El flujo de GitHub Actions compila y despliega GitHub Pages desde main. En Settings → Pages → Build and deployment, la fuente debe ser GitHub Actions. En Supabase Auth → URL Configuration, agregar https://martinezdiegoe-ux.github.io/scit-gestion-dpp/ como URL de redirección de invitación y recuperación de contraseña.

## Primer acceso

Diego Eduardo Martinez y Juan Pablo Marin recibieron invitaciones en sus respectivos correos. Ambos perfiles están activos con rol Director para esta etapa de pruebas. El enlace de invitación abre la aplicación y permite elegir la contraseña inicial; una cuenta nueva necesita además activación por un Director. Si el enlace caducó, usar **Recuperar contraseña** en la pantalla de ingreso. El acceso posterior es con correo y contraseña.

La pantalla de ingreso incluye **Instalar aplicación**. En navegadores compatibles abre el aviso de instalación; en iPhone o iPad se agrega desde Compartir → Agregar a inicio.

Desde la aplicación, un Director puede invitar usuarios nuevos y asignarles roles. Las nuevas invitaciones reciben inicialmente permiso de solo lectura. No se eliminaron ni reemplazaron los 47 cupos institucionales.

## Permisos

Las políticas RLS exigen perfil activo para leer datos. Director, Coordinador y Administrativo pueden cargar y actualizar; solo Director puede borrar y administrar perfiles. Solo lectura consulta. Las operaciones de pasantías se ejecutan en transacciones de la base y sus triggers impiden superposiciones, segundas renovaciones y plazos superiores a 12 + 6 meses. Las vistas de alertas usan security_invoker.

La función de invitación envía correo sólo cuando el Director pulsa Invitar usuario. Las dos cuentas iniciales se invitaron desde el panel de Supabase y se validaron por identificador y correo antes de asignarles el rol Director.

## Seguridad de acceso

El registro público se rechaza en la base de datos: `auth.users` exige una invitación institucional (`invited_at` establecido por Supabase Auth, no por metadatos del usuario). Toda cuenta nueva se crea inactiva y con rol lectura; después de invitar, un Director debe activarla desde **Usuarios y permisos → Editar**. Los cuatro perfiles existentes conservaron su estado y sus roles.

RLS comprueba el perfil activo y la existencia de la sesión en `auth.sessions`. Una sesión revocada o con más de 12 horas no tiene acceso a datos institucionales. El cliente cierra por 30 minutos de inactividad, guarda sus tokens en `sessionStorage` (o en memoria si no está disponible), elimina el almacenamiento persistente anterior de este proyecto y limpia datos en pantalla al salir. Los tokens siguen siendo accesibles al JavaScript de la aplicación; esto no equivale a una arquitectura con cookies HttpOnly. La política CSP limita scripts a este origen y las conexiones al proyecto Supabase.

Las funciones verifican usuario y permisos en el servidor, aceptan JSON de hasta 8 KiB, restringen CORS al origen institucional y ocultan errores internos. `invite-user` permite 5 solicitudes por hora y usuario; `refresh-expedients`, 10 por minuto y usuario; el cron autenticado, 4 por minuto. Los contadores son atómicos y privados. No se registran cuerpos de solicitudes ni credenciales. Las credenciales del cron continúan en Vault.

La PWA conserva solamente recursos públicos de la aplicación; no almacena respuestas de Auth, datos de la API ni archivos de pasantes. Su limpieza de caché se limita a esta aplicación y no afecta otras aplicaciones en el mismo dominio. La exportación de RRHH conserva 17 columnas, combinaciones de encabezados y fechas, y fuerza los textos de usuarios a ser textos, no fórmulas.

Validación: `npm ci`, `npm run build`, `npm run test:security`, `npm audit`. `tests/security.sql` comprueba las políticas con operaciones en una transacción que termina con ROLLBACK, sin enviar correos ni conservar usuarios de prueba. Se ejecuta con una conexión administrativa y requiere un perfil institucional de lectura existente.

El proyecto mantiene el plan gratuito. La protección de contraseñas filtradas de Supabase requiere Pro; no se cambió el plan. La pantalla para establecer contraseña exige 12 caracteres con mayúsculas, minúsculas, números y símbolos; la misma política ya está configurada en Auth (Authentication → Sign In / Providers → Email), con cambio seguro de contraseña y confirmación de cambios de correo. **Allow new users to sign up** quedó desactivado también en el panel como segunda barrera además del rechazo en la base. Los accesos anónimos continúan desactivados y se exige confirmación del correo.
