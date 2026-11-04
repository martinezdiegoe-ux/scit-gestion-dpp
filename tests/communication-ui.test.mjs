import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Render the real components without credentials; effects and network requests do not run in SSR.
const originalWindow=globalThis.window;
globalThis.window={location:{hash:'',search:''},localStorage:{length:0,key(){return null}},sessionStorage:undefined};
const server=await createServer({server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
try{
 const {default:Communication}=await server.ssrLoadModule('/src/Communication.tsx');
 const {CommunicationEditor}=await server.ssrLoadModule('/src/CommunicationImages.tsx');
 const today=new Date().toISOString().slice(0,10);
 const props={data:{communication:[{id:'sample',title:'Actividad de prueba',target_date:today,item_type:'PUBLICACION_RRSS',status:'PLANIFICADO'}]},reload:async()=>{}};
 test('editing roles have a visible upload button directly on every activity card',()=>{
  const html=renderToStaticMarkup(React.createElement(Communication,{...props,canEdit:true}));
  assert.match(html,/Cargar imágenes para Actividad de prueba/);assert.match(html,/>Cargar imágenes</);assert.match(html,/type="file"[^>]*multiple/);assert.match(html,/Ver imágenes/);assert.match(html,/Editar actividad/);
 });
 test('a read-only account can view images but cannot upload or edit',()=>{
  const html=renderToStaticMarkup(React.createElement(Communication,{...props,canEdit:false}));
  assert.doesNotMatch(html,/type="file"/);assert.doesNotMatch(html,/Cargar imágenes para/);assert.match(html,/Tu cuenta permite consultar imágenes/);
 });
 test('the activity form includes an image picker before Save',()=>{
  const html=renderToStaticMarkup(React.createElement(CommunicationEditor,{initial:{},fields:[{key:'title',label:'Título',required:true}],onClose(){},onUploaded(){},onSaved(){},reload:async()=>{}}));
  assert.match(html,/Imágenes de la actividad/);assert.match(html,/Seleccionar imágenes para esta actividad/);assert.match(html,/JPG, PNG o WebP/);assert.ok(html.indexOf('type="file"')<html.indexOf('>Guardar actividad</'));
 });
}finally{await server.close();globalThis.window=originalWindow;}
