import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20260929_stage3c_materialisation_integrity.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../supabase/verification/stage3c_materialisation_integrity_verification.sql', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('../supabase/migrations/20260927_stage3a_recurring_occurrence_foundation.sql', import.meta.url), 'utf8');
const databases = new Set();

async function materialiserDb() {
  const db = new PGlite(); databases.add(db);
  await db.exec(`
    create role authenticated; create role anon; create role service_role; create schema auth;
    create type public.account_status as enum ('Pending','Approved','Rejected','Archived');
    create type public.app_role as enum ('Member','Admin','Registrar');
    create type public.rule_action as enum ('REGISTER','WITHDRAW'); create type public.rule_type as enum ('NEXT_N','UNTIL_DATE','ALL_FUTURE');
    create table public.profiles(id uuid primary key,status account_status not null,role app_role not null);
    create table public.regions(id uuid primary key,name text,timezone text not null);
    create table public.service_desks(id uuid primary key,name text,status text not null default 'Active',region_id uuid references regions(id));
    create table public.duty_slots(id uuid primary key,desk_id uuid references service_desks(id),day_of_week integer,start_time time,end_time time,effective_from date not null default '2000-01-01',status text not null default 'Active',max_jps integer not null default 1);
    create table public.duty_assignments(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),slot_id uuid references duty_slots(id),duty_date date not null,unique(profile_id,slot_id,duty_date));
    create table public.recurring_rules(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),slot_id uuid references duty_slots(id),action rule_action,rule_type rule_type,start_date date,until_date date,count_n integer,created_at timestamptz default now(),lifecycle_status text default 'ACTIVE',superseded_by uuid,superseded_at timestamptz,ended_at timestamptz);
    create table public.statutory_holidays(holiday_date date primary key); create table public.duty_slot_holiday_overrides(duty_slot_id uuid,duty_date date,is_holiday boolean,primary key(duty_slot_id,duty_date));
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create or replace function public.is_duty_slot_holiday(p_slot_id uuid,p_date date) returns boolean language sql stable as $$ select exists(select 1 from statutory_holidays where holiday_date=p_date) or exists(select 1 from duty_slot_holiday_overrides where duty_slot_id=p_slot_id and duty_date=p_date and is_holiday) $$;
    grant usage on schema public,auth to authenticated,service_role;
  `);
  await db.exec(foundation); await db.exec(migration); return db;
}

async function seed(db,status='Approved') {
  const profile='10000000-0000-0000-0000-000000000001', desk='10000000-0000-0000-0000-000000000002', slot='10000000-0000-0000-0000-000000000003', region='10000000-0000-0000-0000-000000000004';
  await db.query(`insert into profiles values($1,$2,'Member')`,[profile,status]); await db.query(`insert into regions values($1,'Test','Pacific/Auckland')`,[region]);
  await db.query(`insert into service_desks(id,name,status,region_id) values($1,'Test Desk','Active',$2)`,[desk,region]);
  await db.query(`insert into duty_slots(id,desk_id,day_of_week,start_time,end_time,max_jps) values($1,$2,extract(dow from current_date)::int,'09:00','10:00',1)`,[slot,desk]);
  return {profile,slot};
}

test('Stage 3C migration defines lifecycle-safe 142-day materialisation', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('ajpa-stage2c-lifecycle'/);
  assert.match(migration, /v_end:=v_today\+141/);
  assert.match(migration, /lifecycle_status='ACTIVE'/);
  const slotLock = migration.indexOf('for update of slot');
  const ruleLock = migration.indexOf('from public.recurring_rules where id=v_rule.id for update');
  const stateCheck = migration.indexOf("v_rule.lifecycle_status <> 'ACTIVE'");
  const assignmentWork = migration.indexOf('insert into public.duty_assignments');
  assert.ok(slotLock > -1 && ruleLock > slotLock);
  assert.ok(stateCheck > ruleLock && assignmentWork > stateCheck);
  assert.match(migration, /from public\.recurring_rules where id=v_rule\.id for update/);
  assert.match(migration, /if not found or v_rule\.lifecycle_status <> 'ACTIVE' then continue/);
  assert.match(migration, /status <> 'Approved'/);
  assert.match(migration, /'MEMBER_INELIGIBLE'/);
  assert.match(migration, /'STATUTORY_HOLIDAY'/);
  assert.match(migration, /'FULL'/);
  assert.match(migration, /recurring_occurrence_outcomes/);
  assert.match(migration, /materialize_recurring_duty_assignments\(142\)/);
});

test('Stage 3C verification is read-only and checks cron/security structure', () => {
  assert.doesNotMatch(verification, /\b(insert|update|delete|alter|drop|create)\b/i);
  for (const check of ['materialiser function exists', 'materialiser execute restricted', 'shared lifecycle lock present', 'cron command uses 142']) assert.match(verification, new RegExp(check));
});

test('materialiser executes the actual ACTIVE ALL_FUTURE RPC path', async () => {
  const db=await materialiserDb(); const {profile,slot}=await seed(db);
  await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE',current_date)`,[profile,slot]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[profile]);
  const result=(await db.query(`select materialize_recurring_duty_assignments(142) as result`)).rows[0].result;
  assert.equal(result.inserted_assignments,21);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where outcome='BOOKED' and booking_created=true`)).rows[0].n,21);
  const again=(await db.query(`select materialize_recurring_duty_assignments(142) as result`)).rows[0].result;
  assert.equal(again.inserted_assignments,0);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments`)).rows[0].n,21);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes`)).rows[0].n,21);
});

test('materialiser filters lifecycle states and records member ineligibility', async () => {
  for (const status of ['Pending','Rejected','Archived']) {
    const db=await materialiserDb(); const {profile,slot}=await seed(db,status);
    await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE',current_date)`,[profile,slot]);
    await db.query(`select materialize_recurring_duty_assignments(142)`);
    assert.equal((await db.query(`select count(*)::int n from duty_assignments`)).rows[0].n,0);
    assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where outcome='MEMBER_INELIGIBLE'`)).rows[0].n,21);
  }
  const db=await materialiserDb(); const {profile,slot}=await seed(db);
  await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date,lifecycle_status) values($1,$2,'REGISTER','ALL_FUTURE',current_date,'SUPERSEDED'),($1,$2,'REGISTER','ALL_FUTURE',current_date,'ENDED')`,[profile,slot]);
  await db.query(`select materialize_recurring_duty_assignments(142)`);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments`)).rows[0].n,0);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes`)).rows[0].n,0);
});

test('materialiser checks existing booking before capacity and keeps FULL final', async () => {
  const db=await materialiserDb(); const {profile,slot}=await seed(db);
  const other='10000000-0000-0000-0000-000000000099'; await db.query(`insert into profiles values($1,'Approved','Member')`,[other]);
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,current_date)`,[profile,slot]);
  await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE',current_date)`,[profile,slot]);
  await db.query(`select materialize_recurring_duty_assignments(142)`);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where outcome='BOOKED' and booking_created=false`)).rows[0].n,1);
  const db2=await materialiserDb(); const s=await seed(db2); await db2.query(`insert into profiles values('10000000-0000-0000-0000-000000000099','Approved','Member')`); await db2.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values('10000000-0000-0000-0000-000000000099',$1,current_date)`,[s.slot]); await db2.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE',current_date)`,[s.profile,s.slot]); await db2.query(`select materialize_recurring_duty_assignments(142)`); await db2.query(`delete from duty_assignments where profile_id='10000000-0000-0000-0000-000000000099'`); await db2.query(`select materialize_recurring_duty_assignments(142)`); assert.equal((await db2.query(`select count(*)::int n from recurring_occurrence_outcomes where outcome='FULL'`)).rows[0].n,1);
});

test('materialiser keeps holidays in the fixed 142-day calendar horizon', async () => {
  const db=await materialiserDb(); const {profile,slot}=await seed(db);
  await db.query(`update duty_slots set day_of_week=(extract(dow from current_date)::int + 1) % 7 where id=$1`,[slot]);
  await db.query(`insert into statutory_holidays(holiday_date) values(current_date + 1)`);
  const rule=(await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE',current_date) returning id`,[profile,slot])).rows[0].id;
  const slot2='10000000-0000-0000-0000-000000000005';
  await db.query(`insert into duty_slots(id,desk_id,day_of_week,start_time,end_time,max_jps) values($1,(select desk_id from duty_slots where id=$2),(extract(dow from current_date)::int + 2) % 7,'09:00','10:00',1)`,[slot2,slot]);
  const rule2=(await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE',current_date) returning id`,[profile,slot2])).rows[0].id;
  await db.query(`select materialize_recurring_duty_assignments(142)`);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where recurring_rule_id=$1 and duty_date=current_date+141`,[rule])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where recurring_rule_id=$1 and duty_date=current_date+142`,[rule2])).rows[0].n,0);
});
