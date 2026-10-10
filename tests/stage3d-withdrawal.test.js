import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261010_stage3d_withdrawal_integrity.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../supabase/verification/stage3d_withdrawal_integrity_verification.sql', import.meta.url), 'utf8');

test('Stage 3D defines additive durable withdrawal range and override models', () => {
  assert.match(migration, /create table if not exists public\.recurring_withdrawal_requests/);
  assert.match(migration, /create table if not exists public\.recurring_withdrawal_overrides/);
  assert.match(migration, /affected_dates date\[\]/);
  assert.match(migration, /scope text not null check \(scope in \('SINGLE','NEXT_N','UNTIL_DATE','ALL_FUTURE'\)\)/);
});

test('Stage 3D withdrawal counts calendar dates and avoids ALL_FUTURE expansion', () => {
  assert.match(migration, /scheduled_duty_slot_occurrence_dates/);
  assert.match(migration, /limit case when p_scope='NEXT_N' then p_count_n/);
  assert.match(migration, /if p_scope='ALL_FUTURE' then/);
  assert.match(migration, /duty_date>=p_start_date/);
  assert.doesNotMatch(migration, /p_start_date\+365/);
  assert.match(migration, /'WITHDRAWN'/);
  assert.match(migration, /on conflict \(recurring_rule_id,duty_date\)/);
});

test('Stage 3D preserves rule history and established lifecycle lock order', () => {
  assert.doesNotMatch(migration, /create trigger preserve_recurring_rule_history_before_delete/);
  assert.match(migration, /create or replace function public\.apply_member_lifecycle_transition/);
  assert.match(migration, /update recurring_rules set lifecycle_status='ENDED'/);
  assert.doesNotMatch(migration, /delete from recurring_rules/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('ajpa-stage2c-lifecycle'/);
  assert.ok(migration.indexOf('from profiles where id=v_profile_id for update') < migration.indexOf('from duty_slots slot'));
  assert.match(migration, /lifecycle_status='ENDED'/);
});

test('member and administrative withdrawal acquire member before slot advisory lock', () => {
  const member = migration.slice(migration.indexOf('create or replace function public.apply_duty_assignment_change('), migration.indexOf('create or replace function public.apply_duty_assignment_change_for_member'));
  const admin = migration.slice(migration.indexOf('create or replace function public.apply_duty_assignment_change_for_member'), migration.indexOf('create or replace function public.apply_member_lifecycle_transition'));
  for (const body of [member, admin]) {
    assert.ok(body.indexOf('from profiles where') < body.indexOf("ajpa-stage3b-recurring-registration:"));
    assert.ok(body.indexOf("ajpa-stage3b-recurring-registration:") < body.indexOf('from duty_slots slot'));
  }
});

test('Stage 3D verification is read-only', () => {
  assert.doesNotMatch(verification, /\b(insert|update|delete|alter|drop|create)\b/i);
  for (const marker of ['withdrawal_request_table_exists','withdrawal_override_table_exists','member_withdrawal_rpc_exists','admin_rpc_granted']) assert.match(verification, new RegExp(marker));
});
