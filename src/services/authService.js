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
    status: profile.status
  };
}

export async function signInApprovedUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profileError || profile?.status !== 'Approved') {
    await supabase.auth.signOut();
    throw new Error('Your account is not approved. Please contact the Registrar.');
  }

  return mapProfile(profile);
}

// Supabase keeps a signed-in session in the browser. Rehydrate the matching
// approved profile when the application is refreshed or reopened.
export async function getCurrentApprovedUser() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!session?.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profileError || profile?.status !== 'Approved') {
    await supabase.auth.signOut();
    return null;
  }

  return mapProfile(profile);
}

export async function requestPasswordReset(email, redirectTo) {
  const normalisedEmail = email.trim().toLowerCase();
  const { data: accountExists, error: accountCheckError } = await supabase
    .rpc('is_registered_email', { email_to_check: normalisedEmail });

  if (accountCheckError) throw new Error(accountCheckError.message);
  if (!accountExists) {
    throw new Error('NO_REGISTERED_ACCOUNT');
  }

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
