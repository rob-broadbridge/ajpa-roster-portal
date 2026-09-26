import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegistrarMemberCounts, matchesRegistrarMemberFilter } from '../src/utils/memberDirectory.js';
const users = ['Approved', 'Pending', 'Rejected', 'Rejected', 'Archived'].map((status, index) => ({ id: index, status }));
test('Registrar member filters and counts reconcile all statuses', () => {
  const counts = getRegistrarMemberCounts(users);
  assert.deepEqual(counts, { active: 2, rejected: 2, archived: 1, all: 5 });
  assert.equal(counts.active + counts.rejected + counts.archived, counts.all);
  assert.deepEqual(users.filter(user => matchesRegistrarMemberFilter(user, 'REJECTED')).map(user => user.status), ['Rejected', 'Rejected']);
  assert.deepEqual(users.filter(user => matchesRegistrarMemberFilter(user, 'ACTIVE')).map(user => user.status), ['Approved', 'Pending']);
  assert.equal(users.filter(user => matchesRegistrarMemberFilter(user, 'ARCHIVED')).length, 1);
  assert.equal(users.filter(user => matchesRegistrarMemberFilter(user, 'ALL')).length, 5);
});
test('Rejected members retain the reconsider action condition', () => {
  const rejected = users.find(user => user.status === 'Rejected');
  assert.equal(rejected.status, 'Rejected');
  assert.equal(matchesRegistrarMemberFilter(rejected, 'REJECTED'), true);
});
