import { supabase } from '../supabaseClient';

export async function saveUserPreferences(profileId, preferences) {
  const { error } = await supabase.from('user_preferences').upsert({
    profile_id: profileId,
    ...preferences,
    updated_at: new Date().toISOString()
  }, { onConflict: 'profile_id' });

  if (error) throw new Error(error.message);
}
