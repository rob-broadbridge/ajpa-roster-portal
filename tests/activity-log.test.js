import test from 'node:test';
import assert from 'node:assert/strict';
import { formatActivityAction, formatActivityRuleDetail } from '../src/utils/activityLog.js';

const lifecycle = (eventType, fields = {}) => formatActivityAction({ eventType, ...fields });

test('formats all Stage 2C lifecycle actions and transitions', () => {
  assert.equal(lifecycle('MEMBER_APPROVE', { previousStatus: 'Pending', newStatus: 'Approved' }), 'Member approved: Pending → Approved');
  assert.equal(lifecycle('MEMBER_REJECT', { previousStatus: 'Pending', newStatus: 'Rejected' }), 'Member rejected: Pending → Rejected');
  assert.equal(lifecycle('MEMBER_RECONSIDER', { previousStatus: 'Rejected', newStatus: 'Pending' }), 'Member reconsidered: Rejected → Pending');
  assert.equal(lifecycle('MEMBER_ARCHIVE', { previousStatus: 'Approved', newStatus: 'Archived' }), 'Member archived: Approved → Archived');
  assert.equal(lifecycle('MEMBER_REINSTATE', { previousStatus: 'Archived', newStatus: 'Approved', newRole: 'Member' }), 'Member reinstated: Archived → Approved (Member)');
  assert.equal(lifecycle('MEMBER_CHANGE_ROLE', { previousRole: 'Member', newRole: 'Admin' }), 'Member role changed: Member → Admin');
  assert.equal(lifecycle('MEMBER_ROLE_CHANGED', { previousRole: 'Admin', newRole: 'Member' }), 'Member role changed: Admin → Member');
});

test('lifecycle actions remain lifecycle-specific when transition fields are absent', () => {
  for (const eventType of ['MEMBER_APPROVE','MEMBER_REJECT','MEMBER_RECONSIDER','MEMBER_ARCHIVE','MEMBER_REINSTATE','MEMBER_CHANGE_ROLE','MEMBER_ROLE_CHANGED']) {
    const label = lifecycle(eventType);
    assert.match(label, /^Member /);
    assert.notEqual(label, 'Registration rule removed');
  }
});

test('preserves existing roster action formatting', () => {
  assert.equal(formatActivityAction({ eventType: 'DUTY_REGISTERED' }), 'Registered for shift');
  assert.equal(formatActivityAction({ eventType: 'DUTY_WITHDRAWN' }), 'Withdrew from shift');
  assert.equal(formatActivityAction({ eventType: 'RULE_CREATED', ruleAction: 'REGISTER' }), 'Registration rule created');
  assert.equal(formatActivityAction({ eventType: 'RULE_DELETED', ruleAction: 'WITHDRAW' }), 'Withdrawal rule removed');
  assert.equal(formatActivityRuleDetail({ ruleType: 'NEXT_N', ruleCount: 2 }), 'next n · 2 slots');
});
