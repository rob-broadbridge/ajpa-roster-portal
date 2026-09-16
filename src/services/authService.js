import { supabase } from '../supabaseClient';

function mapProfile(profile) {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    warrantNumber: profile.warrant_number,
    role: profile.role,
    isProvisional: profile.is_provisional,
    status: profile.status,
    reminderFrequency: profile.desk_admin_reminder_frequency || 'NONE',
    reminderStartDate: profile.desk_admin_reminder_start_date || '',
    reminderWeeks: profile.desk_admin_reminder_weeks || 4
  };
}

export async function signInPortalUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile) throw new Error('Your account profile could not be found. Please contact an AJPA Registrar.');

  return mapProfile(profile);
}

// Supabase keeps a signed-in session in the browser. Rehydrate the matching
// profile so a pending member can be shown the approval-confirmation screen
// instead of being allowed into the portal.
export async function getCurrentSessionUser() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!session?.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) throw new Error('Your account profile could not be found. Please contact an AJPA Registrar.');

  return mapProfile(profile);
}

export async function requestPasswordReset(email, redirectTo) {
  const normalisedEmail = email.trim().toLowerCase();
  // Supabase deliberately gives the same response for an existing and a
  // non-existing address. Do not add a profile lookup here: it would let a
  // visitor discover which people have accounts in the portal.
  const { error } = await supabase.auth.resetPasswordForEmail(normalisedEmail, { redirectTo });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}
