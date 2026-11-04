import test from 'node:test';
import assert from 'node:assert/strict';
import {imageFormat,MAX_IMAGE_BYTES,persistCommunicationItem,uploadCommunicationImages} from '../src/lib/communicationAssets.ts';

const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13]);
const image=(name='imagen.png',type='image/png')=>new File([png],name,{type});
const input=(key,name)=>({key,file:image(name)});
function clientMock(){
 const state={assets:new Map(),items:new Map(),objects:new Map(),uploaded:[],removed:[],maxActive:0,active:0,user:'11111111-1111-4111-8111-111111111111',failStorage:new Set(),failMetadata:new Set(),loseStorage:new Set(),loseDatabase:new Set()};
 const storage={
  async upload(path,file,options){state.active++;state.maxActive=Math.max(state.maxActive,state.active);await new Promise(resolve=>setTimeout(resolve,2));state.active--;state.uploaded.push({path,options});
   if(state.failStorage.has(file.name))return {error:{message:'network failure'}};
   if(state.objects.has(path))return {error:{statusCode:409,message:'already exists'}};
   state.objects.set(path,file);
   if(state.loseStorage.has(file.name)){state.loseStorage.delete(file.name);return {error:{message:'network response lost'}};}
   return {data:{path},error:null};
  },
  async remove(paths){state.removed.push(...paths);paths.forEach(path=>state.objects.delete(path));return {error:null};},
 };
 const client={auth:{getUser:async()=>({data:{user:state.user?{id:state.user}:null},error:null})},storage:{from(name){assert.equal(name,'scit-communication');return storage;}},from(table){
  const rows=table==='communication_assets'?state.assets:state.items;
  const query={id:null,payload:null,mode:'select',select(){return this;},eq(key,value){assert.equal(key,'id');this.id=value;return this;},insert(row){this.payload=row;this.mode='insert';return this;},upsert(row){this.payload=row;this.mode='upsert';return this;},update(row){this.payload=row;this.mode='update';return this;},async maybeSingle(){return {data:rows.get(this.id)||null,error:null};},async single(){
   const row=this.payload,key=row.id||this.id;
   if(state.failMetadata.has(key))return {data:null,error:{message:'row-level security denied'}};
   if(this.mode==='insert'&&rows.has(key))return {data:null,error:{code:'23505',message:'duplicate'}};
   const value={...rows.get(key),...row,id:key,created_at:new Date().toISOString()};rows.set(key,value);
   if(state.loseDatabase.has(key)){state.loseDatabase.delete(key);return {data:null,error:{message:'network response lost'}};}
   return {data:value,error:null};
  }};
  return query;
 }};
 return {state,client};
}

test('image format is verified from bytes, including files without a MIME type',async()=>{
 assert.deepEqual(await imageFormat(image('foto-sin-tipo','')),{contentType:'image/png',extension:'png'});
 assert.equal((await imageFormat(new File([Uint8Array.from([255,216,255,224])],'foto.jpg'))).extension,'jpg');
 await assert.rejects(imageFormat(new File(['<script>bad</script>'],'falsa.png',{type:'image/png'})),/JPG, PNG o WebP/);
 await assert.rejects(imageFormat(new File([],'vacia.png')),/vacío/);
 await assert.rejects(imageFormat(new File([new Uint8Array(MAX_IMAGE_BYTES+1)],'grande.png')),/15 MB/);
});
test('multiple images upload sequentially and each is linked to its activity and uploader',async()=>{
 const {client,state}=clientMock(),progress=[];
 const results=await uploadCommunicationImages(client,'activity',[input('one','a.png'),input('two','b.png'),input('three','c.png')],{onProgress:value=>progress.push(value)});
 assert.equal(state.maxActive,1);assert.equal(results.filter(result=>result.row).length,3);assert.equal(progress.at(-1).completed,3);
 assert.ok([...state.assets.values()].every(row=>row.item_id==='activity'&&row.uploaded_by===state.user&&row.review_status==='EN_REVISION'));
 assert.ok(state.uploaded.every(upload=>upload.options.upsert===false&&upload.options.contentType==='image/png'));
});
test('a failed image does not interrupt the rest, and retries do not duplicate successful images',async()=>{
 const {client,state}=clientMock(),files=[input('one','a.png'),input('two','b.png'),input('three','c.png')];state.failStorage.add('b.png');
 const first=await uploadCommunicationImages(client,'activity',files);assert.deepEqual(first.map(value=>!!value.row),[true,false,true]);assert.equal(state.assets.size,2);
 state.failStorage.clear();const retried=await uploadCommunicationImages(client,'activity',first.filter(value=>value.error));assert.equal(retried[0].row.id,'two');assert.equal(state.assets.size,3);
 const before=state.uploaded.length;await uploadCommunicationImages(client,'activity',files);assert.equal(state.uploaded.length,before);assert.equal(state.assets.size,3);
});
test('database rejection removes the uploaded orphan and reports an actionable permission error',async()=>{
 const {client,state}=clientMock();state.failMetadata.add('one');const results=await uploadCommunicationImages(client,'activity',[input('one','a.png')]);
 assert.equal(state.objects.size,0);assert.deepEqual(state.removed,['activity/one.png']);assert.match(results[0].error,/sesión|permiso/);
});
test('lost Storage and database responses can be reconciled without creating duplicates',async()=>{
 const {client,state}=clientMock();state.loseStorage.add('a.png');const file=input('one','a.png');
 const first=await uploadCommunicationImages(client,'activity',[file]);assert.ok(first[0].error);assert.equal(state.objects.size,1);
 state.loseDatabase.add('one');const retry=await uploadCommunicationImages(client,'activity',[file]);assert.equal(retry[0].row.id,'one');assert.equal(state.objects.size,1);assert.equal(state.assets.size,1);assert.equal(state.removed.length,0);
});
test('missing authentication never writes to Storage or the database',async()=>{
 const {client,state}=clientMock();state.user=null;
 await assert.rejects(uploadCommunicationImages(client,'activity',[input('one','a.png')]),/Sesión/);assert.equal(state.uploaded.length,0);assert.equal(state.assets.size,0);
});
test('saving a new activity again after a partial upload reuses the same identifier',async()=>{
 const {client,state}=clientMock();await persistCommunicationItem(client,{title:'Actividad'},'stable-id',true);await persistCommunicationItem(client,{title:'Actividad corregida'},'stable-id',true);
 assert.equal(state.items.size,1);assert.equal(state.items.get('stable-id').title,'Actividad corregida');
});
