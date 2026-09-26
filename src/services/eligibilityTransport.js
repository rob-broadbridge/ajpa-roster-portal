import { isApproved } from '../utils/eligibility.js';

// Defence against accidental client loaders, not a replacement for database RLS.
export function createEligibilityTransport(fetchRequest) {
  const operationSpecificRpcPaths = new Set([
    '/rest/v1/rpc/update_service_desk_with_administrators',
    '/rest/v1/rpc/create_service_desk_for_current_user',
    '/rest/v1/rpc/get_member_lifecycle_preview',
    '/rest/v1/rpc/apply_member_lifecycle_transition'
    ,'/rest/v1/rpc/update_member_profile_and_role'
  ]);
  let profile = null;
  let ownProfileId = null;
  let epoch = 0;
  let denied = () => {};
  const requests = new Set();
  const invalidate = () => {
    epoch += 1;
    for (const request of requests) request.abort();
    requests.clear();
  };
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (!url.pathname.startsWith('/rest/v1/')) return fetchRequest(input, init);
    const method = (init.method || 'GET').toUpperCase();
    const profileQueryKeys = [...url.searchParams.keys()];
    const ownProfileRead = url.pathname === '/rest/v1/profiles' && method === 'GET'
      && ownProfileId
      && profileQueryKeys.every(key => key === 'id' || key === 'select')
      && profileQueryKeys.filter(key => key === 'id').length === 1
      && url.searchParams.get('id') === `eq.${ownProfileId}`;
    const pendingProfileWrite = url.pathname === '/rest/v1/rpc/update_pending_profile'
      && method === 'POST' && profile?.status === 'Pending';
    if (!isApproved(profile) && !ownProfileRead && !pendingProfileWrite) {
      return new Response(JSON.stringify({ code: '42501', message: 'Approved membership is required for operational access.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    const generation = epoch;
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    if (init.signal?.aborted) abort.abort();
    init.signal?.addEventListener('abort', onAbort, { once: true });
    requests.add(abort);
    try {
      const response = await fetchRequest(input, { ...init, signal: abort.signal });
      if (generation !== epoch) throw new DOMException('Eligibility changed', 'AbortError');
      const failure = !response.ok ? await response.clone().json().catch(() => null) : null;
      if (generation !== epoch) throw new DOMException('Eligibility changed', 'AbortError');
      const operationSpecificRpc = method === 'POST' && operationSpecificRpcPaths.has(url.pathname);
      const permissionDenied = !operationSpecificRpc && (response.status === 401 || response.status === 403 || failure?.code === '42501'
        || (failure?.code === 'P0001' && /your account is not approved|you are not an assigned|only registrars|you must be an approved/i.test(failure.message)));
      if (!ownProfileRead && permissionDenied) {
        queueMicrotask(() => denied());
      }
      return response;
    } finally {
      requests.delete(abort);
      init.signal?.removeEventListener('abort', onAbort);
    }
  };
  return { fetch, invalidate, setProfile: value => { profile = value; },
    setOwnProfileId: value => { ownProfileId = value; },
    onDenied: listener => { denied = listener; } };
}

export const eligibilityTransport = createEligibilityTransport((...args) => globalThis.fetch(...args));
