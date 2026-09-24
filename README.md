# Gestión DPP · SCIT

PWA para la Dirección de Planificación y Proyectos del Servicio de Catastro e Información Territorial. Prototipo preparado para GitHub + Supabase y posterior migración a servidor institucional Linux/Docker/PostgreSQL.

## Módulos
1. Dashboard ejecutivo.
2. Banco de Proyectos: cartera, avance, hitos, riesgos, responsables, presupuesto y documentación.
3. Pasantías: 47 cupos fijos (S01–S24 Santa Fe; R01–R23 Rosario), ocupación actual e historial, antecedentes normativos, convocatorias, designaciones, vacantes, convenios 12+6 meses y alertas 120/90/60/30 días.
4. Agenda de Comunicación Institucional: calendario, piezas, canales, públicos, responsables, aprobaciones y publicación.
5. Usuarios y permisos: Director, Coordinador, Administrativo y Solo lectura mediante Supabase Auth + RLS.

## Puesta en marcha local (Windows)
1. Instalar Node.js LTS y Git (Docker no es necesario para este prototipo).
2. Descomprimir/clonar el repo.
3. En la carpeta: `npm install`.
4. Crear `.env` copiando `.env.example` y completar URL + clave publicable de Supabase.
5. En Supabase > SQL Editor ejecutar `supabase/migrations/001_initial.sql`.
6. En Supabase > Authentication crear el primer usuario.
7. En SQL Editor asignarle perfil Director: `insert into public.profiles(id,full_name,role) values ('UUID-DEL-USUARIO','Nombre','director');`
8. Ejecutar `npm run dev`.

Si no se crea `.env`, la app abre en modo demostración con datos ficticios para presentar el concepto.

## GitHub
Subir todos los archivos excepto `.env`. El `.gitignore` ya lo excluye. Para prototipo público, desplegar el frontend en Vercel/Netlify/Cloudflare Pages conectando el repo y configurar allí `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Seguridad
La clave `service_role` de Supabase NUNCA debe ir en GitHub ni en el navegador. La clave publicable sí puede estar en variables del frontend porque la protección real está en RLS. Para producción institucional se recomienda endurecer políticas por módulo, MFA/SSO si está disponible, logs de auditoría, backups y HTTPS.

## Migración institucional
La app evita dependencia fuerte de hosting: frontend React/Vite y datos PostgreSQL. La base de Supabase puede exportarse y restaurarse en PostgreSQL institucional. En una fase de producción puede incorporarse una API Node/TypeScript dentro de Docker para tareas privilegiadas, notificaciones programadas y auditoría avanzada.

## Próximas tareas en Work
- Reemplazar datos demo por consultas Supabase reales.
- CRUD completo de los tres módulos.
- Ficha de cupo con timeline histórico y documentos.
- Automatización de alertas 90 días (correo + panel) mediante cron/Edge Function.
- Exportación PDF/Excel e informes ejecutivos.
- Matriz granular de permisos por módulo/acción.
- Auditoría automática por triggers.
- Carga inicial desde planillas existentes.
