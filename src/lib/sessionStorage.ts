// Tokens live only for the lifetime of this tab/app window, never in localStorage.
export function createSessionStorage(storage?: Storage) {
 const memory=new Map<string,string>();
 return {
  getItem(key:string){try{return storage?.getItem(key)??memory.get(key)??null;}catch{return memory.get(key)??null;}},
  setItem(key:string,value:string){memory.set(key,value);try{storage?.setItem(key,value);}catch{/* In-memory session if storage is unavailable. */}},
  removeItem(key:string){memory.delete(key);try{storage?.removeItem(key);}catch{/* Nothing persisted. */}},
 };
}
export function removeLegacyCredentials(storage:Storage) {
 const prefix='sb-iwouqdqoaurhqxdulnxh-auth-token';
 try{for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith(prefix))storage.removeItem(key);}}catch{/* Storage can be disabled. */}
}
export const IDLE_TIMEOUT_MS=30*60*1000;
