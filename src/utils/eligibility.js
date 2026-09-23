export const isApproved = profile => profile?.status === 'Approved';

export function canAdministerDesk(profile, desk) {
  return isApproved(profile) && (profile.role === 'Registrar'
    || (profile.role === 'Admin' && (desk?.primaryAdminId === profile.id || desk?.secondaryAdminId === profile.id)));
}

// One boundary owns operational state. Changing identity, role or desk scope
// replaces that boundary; responses belonging to the old tree cannot populate it.
export function createEligibilityController({ readProfile, readScope, setNetworkProfile, invalidateRequests }) {
  let snapshot = { phase: 'checking', profile: null, revision: 0 };
  let epoch = 0;
  let pending = null;
  let signature = '';
  const listeners = new Set();
  const publish = next => { snapshot = next; listeners.forEach(listener => listener()); };
  const invalidate = (phase = 'checking') => {
    epoch += 1;
    pending = null;
    signature = '';
    setNetworkProfile(null);
    invalidateRequests();
    publish({ phase, profile: null, revision: snapshot.revision + 1 });
  };
  const refresh = () => {
    if (pending) return pending;
    const requestEpoch = epoch;
    const request = (async () => {
      try {
        const profile = await readProfile();
        if (requestEpoch !== epoch) return;
        setNetworkProfile(profile);
        const scope = isApproved(profile) ? await readScope(profile) : [];
        if (requestEpoch !== epoch) return;
        const phase = !profile ? 'signed-out' : isApproved(profile) ? 'approved'
          : profile.status === 'Pending' ? 'pending' : 'inactive';
        const nextSignature = JSON.stringify([profile, [...scope].sort()]);
        if (nextSignature !== signature || phase !== snapshot.phase) {
          signature = nextSignature;
          invalidateRequests();
          publish({ phase, profile, revision: snapshot.revision + 1 });
        }
      } catch (error) {
        if (requestEpoch !== epoch) return;
        setNetworkProfile(null);
        invalidateRequests();
        signature = '';
        publish({ phase: 'error', profile: null, revision: snapshot.revision + 1, error: error.message });
      }
    })();
    pending = request;
    void request.finally(() => { if (pending === request) pending = null; });
    return request;
  };
  return { refresh, invalidate, getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
}
