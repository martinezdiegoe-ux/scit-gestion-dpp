import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {HttpError,corsHeaders,readJson,consumeBudget,jsonReply} from '../supabase/functions/_shared/security.ts';
import {createSessionStorage,removeLegacyCredentials} from '../src/lib/sessionStorage.ts';
import {createRrhhSheet,rrhhOptions,rrhhFileOptions,monthlyRows} from '../src/lib/rrhhWorkbook.ts';
import writeExcelFile from 'write-excel-file/node';
import {safeExternalUrl} from '../src/lib/safeUrl.ts';

const jsonRequest=(value,headers={})=>new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json',...headers},body:typeof value==='string'?value:JSON.stringify(value)});
test('only the institutional browser origin is allowed; server cron has no Origin',()=>{
 assert.equal(corsHeaders(jsonRequest({}))['Access-Control-Allow-Origin'],'https://martinezdiegoe-ux.github.io');
 assert.equal(corsHeaders(jsonRequest({},{origin:'https://martinezdiegoe-ux.github.io'}))['Access-Control-Allow-Origin'],'https://martinezdiegoe-ux.github.io');
 assert.throws(()=>corsHeaders(jsonRequest({},{origin:'https://attacker.invalid'})),e=>e.status===403);
 assert.equal(jsonReply({ok:true},200,corsHeaders(jsonRequest({}))).headers.get('cache-control'),'no-store');
});
test('JSON requests are bounded and must be objects with the right content type',async()=>{
 assert.deepEqual(await readJson(jsonRequest({id:'test'})),{id:'test'});
 for(const payload of ['[]','null','{invalid'])await assert.rejects(readJson(jsonRequest(payload)),e=>e.status===400);
 await assert.rejects(readJson(jsonRequest({},{'content-type':'application/jsonp'})),e=>e.status===415);
 await assert.rejects(readJson(jsonRequest({value:'x'.repeat(8300)})),e=>e.status===413);
 await assert.rejects(readJson(jsonRequest({},{'content-length':'9000'})),e=>e.status===413);
});
test('request limits fail closed and return Retry-After',async()=>{
 await consumeBudget({rpc:async()=>({data:0,error:null})},'test','invite-user');
 await assert.rejects(consumeBudget({rpc:async()=>({data:35,error:null})},'test','invite-user'),e=>e.status===429&&e.retryAfter===35);
 await assert.rejects(consumeBudget({rpc:async()=>({data:null,error:{message:'private db error'}})},'test','invite-user'),e=>e.status===503&&!e.message.includes('private'));
});
function fakeStorage(){const values=new Map();return {get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
test('session storage works without disk, clears tokens and leaves other applications untouched',()=>{
 const storage=fakeStorage();storage.setItem('sb-iwouqdqoaurhqxdulnxh-auth-token','old-test-value');storage.setItem('other-app-auth-token','other');storage.setItem('scit-theme','dark');
 removeLegacyCredentials(storage);assert.equal(storage.getItem('sb-iwouqdqoaurhqxdulnxh-auth-token'),null);assert.equal(storage.getItem('other-app-auth-token'),'other');assert.equal(storage.getItem('scit-theme'),'dark');
 const isolated=createSessionStorage();isolated.setItem('test','value');assert.equal(isolated.getItem('test'),'value');isolated.removeItem('test');assert.equal(isolated.getItem('test'),null);
 const disabled=createSessionStorage({getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}});disabled.setItem('test','value');assert.equal(disabled.getItem('test'),'value');disabled.removeItem('test');assert.equal(disabled.getItem('test'),null);
});
const data={assignments:[{id:'assignment',slot_id:'slot',intern_id:'intern',start_date:'2026-10-01',end_date:'2028-03-31',status:'ACTIVA',designation_act_id:'act'}],slots:[{id:'slot',code:'S01'}],interns:[{id:'intern',full_name:'=HYPERLINK("https://example.invalid")',dni:'00123456',university:'Universidad de prueba'}],terms:[{assignment_id:'assignment',kind:'INICIAL_12',start_date:'2026-10-01',end_date:'2027-09-30'}],acts:[{id:'act',number:'123',year:2026,act_date:'2026-09-20'}]};
test('RRHH export preserves all 17 columns, dates and text without creating formulas',async()=>{
 const sheet=createRrhhSheet(data,'2026-10','123456.78');assert.equal(sheet.length,4);assert.equal(sheet[3].length,17);assert.equal(monthlyRows(data,'2026-10').length,1);
 assert.equal(sheet[3][6].value,'00123456');assert.equal(sheet[3][7].type,String);assert.equal(sheet[3][7].value,data.interns[0].full_name);assert.equal(sheet[3][11].value,123456.78);assert.equal(sheet[0][1].columnSpan,3);
 assert.throws(()=>createRrhhSheet(data,'2026-10','-1'));
 mkdirSync('/tmp/scit-security-checks',{recursive:true});await writeExcelFile(sheet,rrhhOptions,rrhhFileOptions).toFile('/tmp/scit-security-checks/rrhh.xlsx');assert.ok(existsSync('/tmp/scit-security-checks/rrhh.xlsx'));
});
test('public shell cache is scoped to this app and never intercepts Supabase or other apps',async()=>{
 const listeners={},deleted=[],scope='https://martinezdiegoe-ux.github.io/scit-gestion-dpp/';let files=[];
 const context={URL,Set,Response,AbortController,setTimeout,clearTimeout,
 self:{location:new URL(scope),registration:{scope},addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
 caches:{open:async()=>({addAll:async paths=>{files=paths},match:async()=>new Response('static shell')}),keys:async()=>['scit-dpp-static-old',`workbox-precache-v2-${scope}`,'workbox-precache-v2-https://martinezdiegoe-ux.github.io/grupo-intermedio-gestion/'],delete:async key=>deleted.push(key),match:async()=>new Response('static shell')},fetch:async()=>{throw Error('offline')}};
 vm.runInNewContext(readFileSync('dist/sw.js','utf8'),context);
 await new Promise((resolve,reject)=>listeners.install({waitUntil:promise=>promise.then(resolve,reject)}));
 assert.ok(files.includes('/scit-gestion-dpp/index.html'));assert.equal(files.length,new Set(files).size);
 for(const file of files)assert.ok(existsSync('dist/'+file.replace('/scit-gestion-dpp/','')),file);
 await new Promise((resolve,reject)=>listeners.activate({waitUntil:promise=>promise.then(resolve,reject)}));assert.equal(deleted.length,2);assert.ok(deleted.every(key=>!key.includes('grupo-intermedio')));
 for(const url of ['https://iwouqdqoaurhqxdulnxh.supabase.co/rest/v1/interns','https://martinezdiegoe-ux.github.io/grupo-intermedio-gestion/']){
  let intercepted=false;listeners.fetch({request:{method:'GET',url,mode:'cors'},respondWith:()=>{intercepted=true}});assert.equal(intercepted,false);
 }
 let response;listeners.fetch({request:{method:'GET',url:scope,mode:'navigate'},respondWith:promise=>response=promise});assert.equal(await(await response).text(),'static shell');
});
test('production HTML disallows executable inline scripts and external object embeds',()=>{
 const html=readFileSync('dist/index.html','utf8');assert.match(html,/script-src 'self'/);assert.match(html,/object-src 'none'/);assert.match(html,/name="referrer" content="no-referrer"/);assert.doesNotMatch(html,/script-src[^;]*unsafe/);
});

test('document links cannot execute scripts or embed credentials',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,hello','https://user:password@example.invalid',null])assert.equal(safeExternalUrl(value),undefined);
 assert.equal(safeExternalUrl('https://www.santafe.gov.ar/documento.pdf'),'https://www.santafe.gov.ar/documento.pdf');
});
