import { createClient } from '@supabase/supabase-js';
import { eligibilityTransport } from './services/eligibilityTransport';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: eligibilityTransport.fetch }
});
