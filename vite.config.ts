import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
const base='/scit-gestion-dpp/';
export default defineConfig({
 base,
 plugins:[react(),VitePWA({registerType:'autoUpdate',manifest:{
  name:'Gestión DPP · SCIT',short_name:'DPP SCIT',
  description:'Sistema de Gestión Estratégica de la Dirección de Planificación y Proyectos',
  theme_color:'#0b2d4d',background_color:'#f4f7fb',display:'standalone',
  start_url:base,scope:base,icons:[]
 }})]
});
