import test from 'node:test';
import assert from 'node:assert/strict';
import { isApproved, canAdministerDesk, createEligibilityController } from '../src/utils/eligibility.js';
import { createEligibilityTransport } from '../src/services/eligibilityTransport.js';

const statuses = ['Pending', 'Approved', 'Rejected', 'Archived'];
const roles = ['Member', 'Admin', 'Registrar'];
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const profile = (status = 'Approved', role = 'Member') => ({ id: 'member-one', status, role });
const request = path => `https://example.invalid/rest/v1/${path}`;

for (const status of statuses) for (const role of roles) {
  test(`${status} ${role}: eligibility, scope and operational network gate`, async () => {
    const person = profile(status, role);
    const eligible = status === 'Approved';
    assert.equal(isApproved(person), eligible);
    assert.equal(canAdministerDesk(person, { primaryAdminId: person.id }), eligible && role !== 'Member');
    assert.equal(canAdministerDesk(person, { secondaryAdminId: person.id }), eligible && role !== 'Member');
    assert.equal(canAdministerDesk(person, { primaryAdminId: 'someone-else' }), eligible && role === 'Registrar');
    let networkCalls = 0;
    const transport = createEligibilityTransport(async () => { networkCalls += 1; return new Response('[]'); });
    transport.setProfile(person);
    transport.setOwnProfileId(person.id);
    for (const path of ['service_desks', 'duty_statistics', 'desk_follows', 'user_preferences',
      'roster_activity_audit', 'rpc/get_roster_member_directory_for_current_user', 'rpc/save_duty_statistic_for_member']) {
      const response = await transport.fetch(request(path), { method: path.startsWith('rpc/') ? 'POST' : 'GET' });
      assert.equal(response.status, eligible ? 200 : 403);
    }
    assert.equal(networkCalls, eligible ? 7 : 0);
    assert.equal((await transport.fetch(request(`profiles?id=eq.${person.id}`))).status, 200);
    assert.equal((await transport.fetch(request(`profiles?id=eq.${person.id}&select=*`))).status, 200);
    assert.equal((await transport.fetch(request(`profiles?id=eq.${person.id}&status=Pending`))).status, eligible ? 200 : 403);
    assert.equal((await transport.fetch(request(`profiles?id=eq.${person.id}&id=eq.${person.id}`))).status, eligible ? 200 : 403);
    assert.equal((await transport.fetch(request('profiles?id=eq.another-member'))).status, eligible ? 200 : 403);
    assert.equal((await transport.fetch(request('profiles?id=eq.member-one'), { method: 'PATCH' })).status, eligible ? 200 : 403);
    assert.equal((await transport.fetch(request('rpc/update_pending_profile'), { method: 'POST' })).status,
      eligible || status === 'Pending' ? 200 : 403);
    let scopeReads = 0;
    const controller = createEligibilityController({ readProfile: async () => person,
      readScope: async () => { scopeReads += 1; return []; }, setNetworkProfile: () => {}, invalidateRequests: () => {} });
    await controller.refresh();
    assert.equal(scopeReads, eligible ? 1 : 0);
    assert.equal(controller.getSnapshot().phase, eligible ? 'approved' : status === 'Pending' ? 'pending' : 'inactive');
  });
}

test('eligibility loss replaces the boundary and rejects late refresh results', async () => {
  let person = profile('Approved', 'Registrar');
  let wait = null;
  const network = [];
  const controller = createEligibilityController({ readProfile: () => wait ? wait.promise : Promise.resolve(person),
    readScope: async () => [], setNetworkProfile: value => network.push(value), invalidateRequests: () => {} });
  await controller.refresh();
  const first = controller.getSnapshot().revision;
  wait = deferred();
  const stale = controller.refresh();
  controller.invalidate();
  person = profile('Archived', 'Registrar');
  const oldWait = wait; wait = null;
  await controller.refresh();
  oldWait.resolve(profile('Approved', 'Registrar')); await stale;
  assert.equal(controller.getSnapshot().phase, 'inactive');
  assert.ok(controller.getSnapshot().revision > first);
  assert.equal(network.at(-1).status, 'Archived');
});

test('role and desk-scope changes discard state; an unchanged refresh does not', async () => {
  let person = profile('Approved', 'Admin'); let scope = ['desk-a'];
  const controller = createEligibilityController({ readProfile: async () => person, readScope: async () => scope,
    setNetworkProfile: () => {}, invalidateRequests: () => {} });
  await controller.refresh(); const initial = controller.getSnapshot().revision;
  await controller.refresh(); assert.equal(controller.getSnapshot().revision, initial);
  scope = ['desk-b']; await controller.refresh();
  assert.ok(controller.getSnapshot().revision > initial);
  const scoped = controller.getSnapshot().revision;
  person = profile('Approved', 'Member'); await controller.refresh();
  assert.ok(controller.getSnapshot().revision > scoped);
});

test('network uncertainty fails closed', async () => {
  let fail = false;
  const transport = createEligibilityTransport(async () => new Response('[]'));
  const controller = createEligibilityController({ readProfile: async () => {
    if (fail) throw Error('offline'); return profile();
  }, readScope: async () => [], setNetworkProfile: transport.setProfile, invalidateRequests: transport.invalidate });
  await controller.refresh(); fail = true; await controller.refresh();
  assert.equal(controller.getSnapshot().phase, 'error');
  assert.equal((await transport.fetch(request('duty_slots'))).status, 403);
});

test('late operational responses cannot survive access invalidation', async () => {
  const wait = deferred();
  const transport = createEligibilityTransport(() => wait.promise);
  transport.setProfile(profile());
  const pending = transport.fetch(request('duty_statistics'));
  transport.setProfile(null); transport.invalidate();
  wait.resolve(new Response('[{"old":"data"}]'));
  await assert.rejects(pending, { name: 'AbortError' });
});

test('permission failures request an eligibility refresh, validation errors do not', async () => {
  let status = 403; let body = { code: '42501' }; let denied = 0;
  const transport = createEligibilityTransport(async () => new Response(JSON.stringify(body), { status }));
  transport.setProfile(profile()); transport.onDenied(() => { denied += 1; });
  await transport.fetch(request('rpc/save_duty_statistic_for_member')); await Promise.resolve();
  assert.equal(denied, 1);
  status = 400; body = { code: 'P0001', message: 'Your account is not approved for roster bookings.' };
  await transport.fetch(request('rpc/apply_duty_assignment_change')); await Promise.resolve();
  assert.equal(denied, 2);
  body = { code: 'P0001', message: 'This slot is already full.' };
  await transport.fetch(request('rpc/apply_duty_assignment_change')); await Promise.resolve();
  assert.equal(denied, 2);
});

test('desk maintenance business-rule RPC failures stay local while genuine access denial invalidates', async () => {
  let denied = 0;
  let body = { code: '42501', message: 'An Admin may remove themselves only when another Admin remains.' };
  const transport = createEligibilityTransport(async () => new Response(JSON.stringify(body), { status: 403 }));
  transport.setProfile(profile()); transport.onDenied(() => { denied += 1; });
  await transport.fetch(request('rpc/update_service_desk_with_administrators'), { method: 'POST' });
  await Promise.resolve();
  assert.equal(denied, 0);
  body = { code: '42501', message: 'Approved membership is required for operational access.' };
  await transport.fetch(request('service_desks'));
  await Promise.resolve();
  assert.equal(denied, 1);
});

test('confirmation and approval ordering depend only on the authenticated profile', async () => {
  let person = null; let loads = 0;
  const controller = createEligibilityController({ readProfile: async () => person,
    readScope: async () => { loads += 1; return []; }, setNetworkProfile: () => {}, invalidateRequests: () => {} });
  await controller.refresh(); assert.equal(controller.getSnapshot().phase, 'signed-out');
  person = profile('Pending'); await controller.refresh();
  assert.equal(controller.getSnapshot().phase, 'pending'); assert.equal(loads, 0);
  person = profile(); await controller.refresh();
  assert.equal(controller.getSnapshot().phase, 'approved'); assert.equal(loads, 1);
  controller.invalidate('signed-out'); person = null; await controller.refresh();
  // Approval before confirmation: no authenticated profile until Auth grants a session.
  assert.equal(controller.getSnapshot().phase, 'signed-out');
  person = profile(); await controller.refresh(); assert.equal(controller.getSnapshot().phase, 'approved');
});
