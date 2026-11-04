import { createClient } from '@supabase/supabase-js';
import {createSessionStorage,removeLegacyCredentials} from './sessionStorage';
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
const key=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined;
// Capture the invitation type before supabase-js consumes the URL fragment.
export const initialInviteLink=['invite','recovery'].includes(new URLSearchParams(window.location.hash.slice(1)).get('type')||new URLSearchParams(window.location.search).get('type')||'');
export const configured=Boolean(url&&key);
let tabStorage:Storage|undefined;
try{removeLegacyCredentials(window.localStorage);tabStorage=window.sessionStorage;}catch{/* Fall back to an in-memory session. */}
export const supabase=configured?createClient(url!,key!,{
 auth:{storage:createSessionStorage(tabStorage),storageKey:'scit-dpp-auth-v2',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
}):null;
