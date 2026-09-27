import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20260928_stage3b_interactive_recurring_registration.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../supabase/verification/stage3b_interactive_recurring_registration_verification.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('../supabase/migrations/20260927_stage3a_recurring_occurrence_foundation.sql', import.meta.url), 'utf8');
const databases = new Set();

async function stage3bDb() {
  const db = new PGlite();
  databases.add(db);
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create type public.account_status as enum ('Pending','Approved','Rejected','Archived');
    create type public.app_role as enum ('Member','Admin','Registrar');
    create type public.rule_action as enum ('REGISTER','WITHDRAW');
    create type public.rule_type as enum ('NEXT_N','UNTIL_DATE','ALL_FUTURE');
    create table public.profiles (id uuid primary key, status account_status not null, role app_role not null);
    create table public.service_desks (id uuid primary key, name text not null, status text not null default 'Active');
    create table public.duty_slots (id uuid primary key, desk_id uuid not null references service_desks(id), day_of_week integer not null, start_time time not null, end_time time not null, effective_from date not null default '2000-01-01', status text not null default 'Active', max_jps integer not null default 1);
    create table public.duty_assignments (id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id), slot_id uuid not null references duty_slots(id), duty_date date not null, unique(profile_id,slot_id,duty_date), unique(slot_id,duty_date,profile_id));
    create table public.recurring_rules (id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id), slot_id uuid not null references duty_slots(id), action rule_action not null, rule_type rule_type not null, start_date date not null, until_date date, count_n integer, created_at timestamptz not null default now());
    create table public.statutory_holidays (holiday_date date primary key);
    create table public.duty_slot_holiday_overrides (duty_slot_id uuid references duty_slots(id), duty_date date not null, is_holiday boolean not null, primary key(duty_slot_id,duty_date));
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    create or replace function public.is_duty_slot_holiday(p_slot_id uuid,p_date date) returns boolean language sql stable as $$
      select exists(select 1 from public.statutory_holidays h where h.holiday_date=p_date)
        or exists(select 1 from public.duty_slot_holiday_overrides o where o.duty_slot_id=p_slot_id and o.duty_date=p_date and o.is_holiday)
    $$;
    grant usage on schema public, auth to authenticated, service_role;
  `);
  await db.exec(foundation);
  await db.exec(migration);
  return db;
}

after(async () => { for (const db of databases) await db.close(); });

async function seed(db, { max = 1 } = {}) {
  const profile = '00000000-0000-0000-0000-000000000001';
  const desk = '00000000-0000-0000-0000-000000000010';
  const slot = '00000000-0000-0000-0000-000000000011';
  await db.query(`insert into profiles values ($1,'Approved','Member'), ($2,'Approved','Member')`, ['00000000-0000-0000-0000-000000000002', profile]);
  await db.query(`insert into service_desks values ($1,'Test','Active')`, [desk]);
  await db.query(`insert into duty_slots(id,desk_id,day_of_week,start_time,end_time,max_jps) values ($1,$2,1,'09:00','10:00',$3)`, [slot, desk, max]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [profile]);
  return { profile, desk, slot };
}

test('Stage 3B has durable request idempotency and controlled RPC access', () => {
  assert.match(migration, /create table if not exists public\.recurring_registration_requests/);
  assert.match(migration, /request_id uuid primary key/);
  assert.match(migration, /create or replace function public\.apply_recurring_registration/);
  assert.match(migration, /p_request_id uuid/);
  assert.match(migration, /if found then return v_request/);
  assert.match(migration, /grant execute on function public\.apply_recurring_registration\([^)]*\) to authenticated, service_role/);
  assert.match(migration, /revoke all on function public\.apply_recurring_registration\([^)]*\) from public, anon/);
});

test('Stage 3B processes fixed calendar sequences and structured outcomes', () => {
  assert.match(migration, /scheduled_duty_slot_occurrence_dates/);
  assert.match(migration, /limit case when p_scope='NEXT_N' then p_count_n/);
  assert.match(migration, /p_count_n < 1 or p_count_n > 52/);
  assert.match(migration, /p_until_date > p_start_date\+730/);
  assert.match(migration, /'BOOKED',false/);
  assert.match(migration, /'BOOKED',true/);
  for (const reason of ['STATUTORY_HOLIDAY', 'FULL']) assert.match(migration, new RegExp(reason));
  for (const field of ['requested_count', 'newly_booked_count', 'already_booked_count', 'exception_count', 'occurrences']) assert.match(migration, new RegExp(field));
  assert.ok(migration.indexOf('select array_agg') < migration.indexOf("update recurring_rules set lifecycle_status='SUPERSEDED'"));
});

test('Stage 3B preserves supersession, locking and frontend request reuse', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('ajpa-stage3b-recurring-registration:/);
  assert.match(migration, /lifecycle_status='SUPERSEDED'/);
  assert.match(migration, /superseded_by=v_rule_id/);
  assert.match(app, /recurringRegistrationRequestId\.current = crypto\.randomUUID\(\)/);
  assert.match(app, /apply_recurring_registration/);
  assert.match(app, /p_request_id: recurringRegistrationRequestId\.current/);
});

test('Stage 3B verification is read-only and checks deployed structure', () => {
  assert.doesNotMatch(verification, /insert\s|update\s|delete\s|alter\s|create\s|drop\s/i);
  for (const check of ['request idempotency table exists', 'Stage 3B recurring registration RPC exists', 'outcome uniqueness remains enforced', 'active REGISTER uniqueness remains enforced']) assert.match(verification, new RegExp(check));
});

test('Stage 3B RPC materialises a fixed calendar sequence and records outcomes', async () => {
  const db = await stage3bDb();
  const { profile, slot } = await seed(db, { max: 1 });
  await db.query(`insert into statutory_holidays values ('2026-09-21')`);
  const requestId = '10000000-0000-0000-0000-000000000001';
  const result = (await db.query(`select apply_recurring_registration($1,'2026-09-14','NEXT_N',3,null,$2) as result`, [slot, requestId])).rows[0].result;
  assert.equal(result.requested_count, 3);
  assert.equal(result.newly_booked_count, 2);
  assert.equal(result.exception_count, 1);
  assert.deepEqual(result.occurrences.map((o) => o.duty_date), ['2026-09-14', '2026-09-21', '2026-09-28']);
  assert.equal((await db.query(`select count(*)::int as n from duty_assignments where profile_id=$1`, [profile])).rows[0].n, 2);
  assert.equal((await db.query(`select count(*)::int as n from recurring_occurrence_outcomes`)).rows[0].n, 3);
});

test('Stage 3B RPC preserves existing bookings, counts FULL, and is idempotent', async () => {
  const db = await stage3bDb();
  const { profile, slot } = await seed(db, { max: 1 });
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values ($1,$2,'2026-09-14'), ('00000000-0000-0000-0000-000000000002',$2,'2026-09-21')`, [profile, slot]);
  const requestId = '20000000-0000-0000-0000-000000000001';
  const first = (await db.query(`select apply_recurring_registration($1,'2026-09-14','NEXT_N',2,null,$2) as result`, [slot, requestId])).rows[0].result;
  const second = (await db.query(`select apply_recurring_registration($1,'2026-09-14','NEXT_N',2,null,$2) as result`, [slot, requestId])).rows[0].result;
  assert.deepEqual(second, first);
  assert.equal(first.already_booked_count, 1);
  assert.equal(first.newly_booked_count, 0);
  assert.equal(first.exception_count, 1);
  assert.equal((await db.query(`select count(*)::int as n from recurring_rules where profile_id=$1`, [profile])).rows[0].n, 1);
  assert.equal((await db.query(`select count(*)::int as n from recurring_occurrence_outcomes`)).rows[0].n, 2);
});

test('Stage 3B rejects invalid requests before changing recurring-rule state', async () => {
  const db = await stage3bDb();
  const { profile, slot } = await seed(db);
  await assert.rejects(() => db.query(`select apply_recurring_registration($1,'2026-09-14','NEXT_N',0,null,'30000000-0000-0000-0000-000000000001')`, [slot]), /NEXT_N must be between/);
  await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values ($1,$2,'REGISTER','NEXT_N','2026-09-14')`, [profile, slot]);
  await db.query(`update service_desks set status='Inactive'`);
  await assert.rejects(() => db.query(`select apply_recurring_registration($1,'2026-09-14','NEXT_N',1,null,'30000000-0000-0000-0000-000000000002')`, [slot]), /no longer active/);
  assert.equal((await db.query(`select count(*)::int as n from recurring_rules where lifecycle_status='ACTIVE'`)).rows[0].n, 1);
});

test('Stage 3B UNTIL_DATE is inclusive and preserves holiday/FULL outcomes', async () => {
  const db = await stage3bDb();
  const { profile, slot } = await seed(db, { max: 1 });
  await db.query(`insert into statutory_holidays values ('2026-09-21')`);
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values ('00000000-0000-0000-0000-000000000002',$1,'2026-09-28')`, [slot]);
  const result = (await db.query(`select apply_recurring_registration($1,'2026-09-14','UNTIL_DATE',null,'2026-10-05','40000000-0000-0000-0000-000000000001') as result`, [slot])).rows[0].result;
  assert.equal(result.requested_count, 4);
  assert.equal(result.newly_booked_count, 2);
  assert.equal(result.exception_count, 2);
  assert.deepEqual(result.occurrences.map((o) => o.duty_date), ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']);
  assert.equal((await db.query(`select count(*)::int as n from recurring_occurrence_outcomes where outcome='STATUTORY_HOLIDAY'`)).rows[0].n, 1);
  assert.equal((await db.query(`select count(*)::int as n from recurring_occurrence_outcomes where outcome='FULL'`)).rows[0].n, 1);
  assert.equal((await db.query(`select count(*)::int as n from duty_assignments where profile_id=$1`, [profile])).rows[0].n, 2);
});

test('Stage 3B UNTIL_DATE reaches beyond the visible roster and enforces 730 days', async () => {
  const db = await stage3bDb();
  const { slot } = await seed(db, { max: 1 });
  const result = (await db.query(`select apply_recurring_registration($1,'2026-09-14','UNTIL_DATE',null,'2027-04-05','40000000-0000-0000-0000-000000000002') as result`, [slot])).rows[0].result;
  assert.ok(result.requested_count > 20);
  await assert.rejects(() => db.query(`select apply_recurring_registration($1,'2026-09-14','UNTIL_DATE',null,'2028-09-15','40000000-0000-0000-0000-000000000003')`, [slot]), /within 730 days/);
});

test('Stage 3B ALL_FUTURE creates a continuing rule with a 365-day initial set', async () => {
  const db = await stage3bDb();
  const { profile, slot } = await seed(db, { max: 1 });
  const result = (await db.query(`select apply_recurring_registration($1,'2026-09-14','ALL_FUTURE',null,null,'50000000-0000-0000-0000-000000000001') as result`, [slot])).rows[0].result;
  assert.equal(result.scope, 'ALL_FUTURE');
  assert.ok(result.requested_count > 20 && result.requested_count <= 60);
  assert.equal((await db.query(`select count(*)::int as n from recurring_rules where profile_id=$1 and lifecycle_status='ACTIVE' and rule_type='ALL_FUTURE'`, [profile])).rows[0].n, 1);
  assert.equal((await db.query(`select count(*)::int as n from recurring_occurrence_outcomes`)).rows[0].n, result.requested_count);
});

test('Stage 3B rejects unapproved members and inactive slots before creating rules', async () => {
  const db = await stage3bDb();
  const { profile, slot } = await seed(db);
  await db.query(`update profiles set status='Pending' where id=$1`, [profile]);
  await assert.rejects(() => db.query(`select apply_recurring_registration($1,'2026-09-14','NEXT_N',1,null,'60000000-0000-0000-0000-000000000001')`, [slot]), /not approved/);
  await db.query(`update profiles set status='Approved'`);
  await db.query(`update duty_slots set status='Inactive'`);
  await assert.rejects(() => db.query(`select apply_recurring_registration($1,'2026-09-14','NEXT_N',1,null,'60000000-0000-0000-0000-000000000002')`, [slot]), /no longer active/);
  assert.equal((await db.query(`select count(*)::int as n from recurring_rules`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from recurring_occurrence_outcomes`)).rows[0].n, 0);
});

test('Stage 3B distinct request UUID creates a new rule and preserves assignments', async () => {
  const db = await stage3bDb();
  const { profile, slot } = await seed(db, { max: 1 });
  const first = (await db.query(`select apply_recurring_registration($1,'2026-09-14','NEXT_N',1,null,'70000000-0000-0000-0000-000000000001') as result`, [slot])).rows[0].result;
  const second = (await db.query(`select apply_recurring_registration($1,'2026-09-14','NEXT_N',1,null,'70000000-0000-0000-0000-000000000002') as result`, [slot])).rows[0].result;
  assert.notEqual(first.rule_id, second.rule_id);
  const rules = (await db.query(`select lifecycle_status,superseded_by from recurring_rules where profile_id=$1 order by created_at`, [profile])).rows;
  assert.equal(rules.length, 2);
  assert.equal(rules[0].lifecycle_status, 'SUPERSEDED');
  assert.equal(rules[0].superseded_by, second.rule_id);
  assert.equal((await db.query(`select count(*)::int as n from duty_assignments where profile_id=$1`, [profile])).rows[0].n, 1);
  assert.equal(second.already_booked_count, 1);
});
