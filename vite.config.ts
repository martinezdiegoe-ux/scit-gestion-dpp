import {createHash} from 'node:crypto';
import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react';

const base='/scit-gestion-dpp/';
// Cache only the public application shell. Auth, API data and uploaded files never enter this cache.
function institutionalPwa():Plugin {
 return {
  name:'scit-public-shell',enforce:'post',
  transformIndexHtml(){return [{tag:'link',attrs:{rel:'manifest',href:base+'manifest.webmanifest'},injectTo:'head'},{tag:'script',attrs:{src:base+'registerSW.js',defer:true},injectTo:'head'}]},
  generateBundle(_options,bundle){
   const manifest={id:base,name:'Gestión DPP · SCIT',short_name:'DPP SCIT',description:'Sistema de Gestión Estratégica de la Dirección de Planificación y Proyectos',theme_color:'#0b2d4d',background_color:'#f4f7fb',display:'standalone',lang:'es',start_url:base,scope:base,icons:[{src:base+'icon-192.png',sizes:'192x192',type:'image/png'},{src:base+'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]};
   this.emitFile({type:'asset',fileName:'manifest.webmanifest',source:JSON.stringify(manifest)});
   const files=[...new Set([...Object.keys(bundle).filter(name=>!name.endsWith('.map')),'manifest.webmanifest','registerSW.js','icon-192.png','icon-512.png','scit-logo.png'])];
   const digest=createHash('sha256');
   for(const name of Object.keys(bundle).sort()){const file=bundle[name];digest.update(name);digest.update(file.type==='chunk'?file.code:file.source)}
   const version=digest.digest('hex').slice(0,16);
   this.emitFile({type:'asset',fileName:'registerSW.js',source:`if('serviceWorker' in navigator){window.addEventListener('load',()=>{let reloading=false;const hadController=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!reloading){reloading=true;location.reload()}});navigator.serviceWorker.register('${base}sw.js',{scope:'${base}',updateViaCache:'none'}).then(reg=>{reg.update().catch(()=>{});setInterval(()=>reg.update().catch(()=>{}),3600000)}).catch(()=>{})})}`});
   this.emitFile({type:'asset',fileName:'sw.js',source:`
const CACHE='scit-dpp-static-${version}';
const FILES=${JSON.stringify(files.map(name=>base+name))};
const ALLOWED=new Set(FILES.map(path=>new URL(path,self.location.origin).href));
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&(key.startsWith('scit-dpp-static-')||(key.startsWith('workbox-precache')&&key.includes(self.registration.scope)))).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('${base}'))return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);try{const response=await fetch(request,{signal:controller.signal});if(!response.ok)throw Error();return response;}catch{return(await caches.match('${base}index.html'))||new Response('Sin conexión. Volvé a intentar cuando tengas internet.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}})}finally{clearTimeout(timer)}})());return;
 }
 if(ALLOWED.has(url.href))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));
});`});
  },
 };
}
export default defineConfig({base,plugins:[react(),institutionalPwa()],build:{sourcemap:false}});
