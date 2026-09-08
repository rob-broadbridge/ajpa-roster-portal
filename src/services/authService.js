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

export async function requestPasswordReset(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
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
