import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
const key=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined;
// Capture the invitation type before supabase-js consumes the URL fragment.
export const initialInviteLink=new URLSearchParams(window.location.hash.slice(1)).get('type')==='invite'||new URLSearchParams(window.location.search).get('type')==='invite';
export const configured=Boolean(url&&key);
export const supabase=configured?createClient(url!,key!):null;
