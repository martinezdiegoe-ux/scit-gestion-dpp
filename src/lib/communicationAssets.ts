import type {SupabaseClient} from '@supabase/supabase-js';
import type {Row} from './data';

export const COMMUNICATION_BUCKET='scit-communication';
export const IMAGE_ACCEPT='image/jpeg,image/png,image/webp';
export const MAX_IMAGE_BYTES=15*1024*1024;
export type UploadInput={key:string;file:File};
export type UploadResult=UploadInput&{row?:Row;error?:string};
export type UploadProgress={completed:number;total:number;name:string;key:string};

export async function imageFormat(file:File):Promise<{contentType:string;extension:string}> {
 if(!file.size)throw Error('El archivo está vacío.');
 if(file.size>MAX_IMAGE_BYTES)throw Error('La imagen supera los 15 MB.');
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return {contentType:'image/jpeg',extension:'jpg'};
 if([137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return {contentType:'image/png',extension:'png'};
 const chars=String.fromCharCode(...bytes);
 if(chars.startsWith('RIFF')&&chars.slice(8,12)==='WEBP')return {contentType:'image/webp',extension:'webp'};
 throw Error('Elegí una imagen JPG, PNG o WebP válida.');
}
export function uploadMessage(error:unknown):string {
 const failure=error as {message?:string;statusCode?:string|number;status?:number};
 const message=failure?.message||String(error);
 if(/row.level|permission|jwt|token.*expired|not authenticated/i.test(message)||[401,403].includes(Number(failure?.statusCode||failure?.status)))return 'Tu sesión venció o no tenés permiso para cargar imágenes. Volvé a ingresar.';
 if(/fetch|network|offline|timeout/i.test(message))return 'No se pudo conectar. Revisá tu conexión y reintentá la carga.';
 if(/15 MB|está vacío|JPG, PNG o WebP/.test(message))return message;
 return 'No se pudo guardar la imagen. Podés reintentar sin duplicar las que ya se cargaron.';
}

async function existingAsset(client:SupabaseClient,key:string):Promise<Row|null> {
 const {data,error}=await client.from('communication_assets').select('*').eq('id',key).maybeSingle();
 if(error)throw error;
 return data;
}
async function uploadOne(client:SupabaseClient,itemId:string,input:UploadInput,userId:string):Promise<Row> {
 const format=await imageFormat(input.file);
 const path=`${itemId}/${input.key}.${format.extension}`;
 const existing=await existingAsset(client,input.key);
 if(existing){if(existing.item_id!==itemId||existing.storage_path!==path)throw Error('Identidad de imagen inválida');return existing;}
 const storage=client.storage.from(COMMUNICATION_BUCKET);
 const {error:uploadError}=await storage.upload(path,input.file,{contentType:format.contentType,upsert:false,cacheControl:'300'});
 // A prior attempt may have reached Storage before the response was interrupted.
 if(uploadError&&Number(uploadError.statusCode)!==409&&!/already exists|duplicate/i.test(uploadError.message))throw uploadError;
 const {data:row,error:saveError}=await client.from('communication_assets').insert({id:input.key,item_id:itemId,storage_path:path,file_name:input.file.name.slice(0,200),uploaded_by:userId,review_status:'EN_REVISION'}).select('*').single();
 if(!saveError)return row;
 // Reconcile a lost database response before removing the uploaded object.
 let recovered:Row|null;
 try{recovered=await existingAsset(client,input.key);}catch{throw saveError;}
 if(recovered&&recovered.item_id===itemId&&recovered.storage_path===path)return recovered;
 const {error:cleanupError}=await storage.remove([path]);
 if(cleanupError)throw Error('No se pudo vincular la imagen. Reintentá para recuperar la carga.');
 throw saveError;
}
export async function uploadCommunicationImages(client:SupabaseClient,itemId:string,inputs:UploadInput[],callbacks:{onProgress?:(value:UploadProgress)=>void;onUploaded?:(row:Row)=>void}={}):Promise<UploadResult[]> {
 const {data:{user},error}=await client.auth.getUser();
 if(error||!user)throw Error('Sesión no válida. Volvé a ingresar para cargar imágenes.');
 const results:UploadResult[]=[];
 for(const input of inputs){
  callbacks.onProgress?.({completed:results.length,total:inputs.length,name:input.file.name,key:input.key});
  let result:UploadResult;
  try{result={...input,row:await uploadOne(client,itemId,input,user.id)};}
  catch(error){result={...input,error:uploadMessage(error)};}
  results.push(result);if(result.row)callbacks.onUploaded?.(result.row);
  callbacks.onProgress?.({completed:results.length,total:inputs.length,name:input.file.name,key:input.key});
 }
 return results;
}
export async function persistCommunicationItem(client:SupabaseClient,row:Row,id:string,isNew:boolean):Promise<Row> {
 const query=isNew?client.from('communication_items').upsert({...row,id},{onConflict:'id'}):client.from('communication_items').update(row).eq('id',id);
 const {data,error}=await query.select('*').single();
 if(error)throw Error('No se pudo guardar la actividad. Revisá la conexión y volvé a intentar.');
 return data;
}
