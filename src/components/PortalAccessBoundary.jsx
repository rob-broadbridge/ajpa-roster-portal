import { useEffect, useState, useSyncExternalStore } from 'react';
import App from '../App';
import { supabase } from '../supabaseClient';
import { getCurrentSessionUser, signOutUser } from '../services/authService';
import { eligibilityTransport } from '../services/eligibilityTransport';
import { createEligibilityController } from '../utils/eligibility';
import PendingAccess from './PendingAccess';

export default function PortalAccessBoundary() {
  const [controller] = useState(() => createEligibilityController({
    readProfile: getCurrentSessionUser,
    readScope: async profile => {
      if (profile.role !== 'Admin') return [];
      const { data, error } = await supabase.from('service_desks').select('id')
        .or(`primary_admin_id.eq.${profile.id},secondary_admin_id.eq.${profile.id}`);
      if (error) throw error;
      return data.map(desk => desk.id);
    },
    setNetworkProfile: eligibilityTransport.setProfile,
    invalidateRequests: eligibilityTransport.invalidate
  }));
  const access = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [signOutError, setSignOutError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active && document.visibilityState !== 'hidden' && controller.getSnapshot().phase !== 'recovery') {
        void controller.refresh();
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { controller.invalidate('recovery'); return; }
      if (event === 'SIGNED_OUT') { controller.invalidate('signed-out'); return; }
      if (event === 'SIGNED_IN' && session?.user.id !== controller.getSnapshot().profile?.id) {
        controller.invalidate();
      }
      // Do not await Supabase work inside its auth callback (it holds an auth lock).
      setTimeout(refresh, 0);
    });
    eligibilityTransport.onDenied(() => {
      if (!active) return;
      controller.invalidate();
      refresh();
    });
    if (new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery') controller.invalidate('recovery');
    else refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    // One own-profile check per minute while visible bounds stale open sessions.
    // RLS/RPC checks remain authoritative between these lightweight checks.
    const timer = setInterval(refresh, 60000);
    return () => {
      active = false;
      subscription.unsubscribe();
      eligibilityTransport.onDenied(() => {});
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(timer);
      controller.invalidate();
    };
  }, [controller]);
  const signOut = async () => {
    setSignOutError('');
    try { await signOutUser(); controller.invalidate('signed-out'); }
    catch (error) { setSignOutError(error.message); }
  };
  if (access.phase === 'approved' || access.phase === 'signed-out' || access.phase === 'recovery') {
    return <App key={access.revision} initialProfile={access.profile}
      initialRecovery={access.phase === 'recovery'} onSessionChange={controller.refresh} />;
  }
  if (access.phase === 'pending') return <>
    <PendingAccess key={access.profile.id} profile={access.profile} onRefresh={controller.refresh} onSignOut={signOut} />
    {signOutError && <p role="alert">{signOutError}</p>}
  </>;
  return <main className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
    <section className="max-w-md bg-white rounded-xl p-6 space-y-4">
      <h1 className="text-xl font-bold">{access.phase === 'checking' ? 'Checking your account…'
        : access.phase === 'error' ? 'Unable to verify your account' : 'Account inactive'}</h1>
      {access.phase === 'inactive' && <p>Your account is {access.profile.status.toLowerCase()}. Contact an AJPA Registrar for assistance.</p>}
      {access.phase === 'error' && <><p>Operational access is unavailable until your account can be verified.</p>
        <button onClick={() => controller.refresh()} className="underline">Try again</button></>}
      {access.phase !== 'checking' && <button onClick={signOut} className="block underline">Sign Out</button>}
      {signOutError && <p role="alert">{signOutError}</p>}
    </section>
  </main>;
}
