import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const foundation = readFileSync(new URL('../supabase/migrations/20260927_stage3a_recurring_occurrence_foundation.sql', import.meta.url), 'utf8');
const stage3b = readFileSync(new URL('../supabase/migrations/20260928_stage3b_interactive_recurring_registration.sql', import.meta.url), 'utf8');
const stage3d = readFileSync(new URL('../supabase/migrations/20261010_stage3d_withdrawal_integrity.sql', import.meta.url), 'utf8');
const dbs = new Set();

async function fixture() {
  const db = new PGlite(); dbs.add(db);
  await db.exec(`
    create role authenticated; create role anon; create role service_role; create schema auth;
    create type public.account_status as enum ('Pending','Approved','Rejected','Archived');
    create type public.app_role as enum ('Member','Admin','Registrar');
    create type public.rule_action as enum ('REGISTER','WITHDRAW');
    create type public.rule_type as enum ('NEXT_N','UNTIL_DATE','ALL_FUTURE');
    create table public.profiles(id uuid primary key,status account_status not null,role app_role not null,full_name text);
    create table public.regions(id uuid primary key,timezone text not null);
    create table public.service_desks(id uuid primary key,name text,status text not null default 'Active',region_id uuid,primary_admin_id uuid,secondary_admin_id uuid);
    create table public.duty_slots(id uuid primary key,desk_id uuid references service_desks(id),day_of_week integer not null,start_time time not null,end_time time not null,effective_from date not null default '2000-01-01',status text not null default 'Active',max_jps integer not null default 1);
    create table public.duty_assignments(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),slot_id uuid references duty_slots(id),duty_date date not null,unique(profile_id,slot_id,duty_date));
    create table public.duty_statistics(id uuid primary key default gen_random_uuid(),profile_id uuid not null references profiles(id) on delete restrict,slot_id uuid not null references duty_slots(id) on delete restrict,duty_date date not null,desk_name_snapshot text not null,desk_code_snapshot text,start_time_snapshot time,end_time_snapshot time,no_of_clients integer not null default 0,no_of_hours_worked numeric not null default 0,certified_copies integer not null default 0,statutory_declarations integer not null default 0,signatures_witnessed integer not null default 0,affidavits integer not null default 0,other_duties integer not null default 0,notes text not null default '',unique(profile_id,slot_id,duty_date),check(no_of_clients>=0 and no_of_hours_worked>=0 and certified_copies>=0 and statutory_declarations>=0 and signatures_witnessed>=0 and affidavits>=0 and other_duties>=0));
    create table public.recurring_rules(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),slot_id uuid references duty_slots(id),action rule_action not null,rule_type rule_type not null,start_date date not null,until_date date,count_n integer,created_at timestamptz not null default now(),lifecycle_status text not null default 'ACTIVE',superseded_by uuid,superseded_at timestamptz,ended_at timestamptz);
    create table public.statutory_holidays(holiday_date date primary key);
    create table public.duty_slot_holiday_overrides(duty_slot_id uuid,duty_date date,is_holiday boolean,primary key(duty_slot_id,duty_date));
    create table public.duty_assignment_cancellations(id uuid primary key default gen_random_uuid(),profile_id uuid,slot_id uuid,duty_date date not null,desk_name_snapshot text,cancelled_at timestamptz not null default now(),cancelled_by uuid,reason text not null,unique(profile_id,slot_id,duty_date));
    create table public.roster_activity_audit(id uuid primary key default gen_random_uuid(),actor_profile_id uuid,subject_profile_id uuid,event_type text,previous_status text,new_status text,previous_role text,new_role text,created_at timestamptz default now());
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create or replace function public.is_duty_slot_holiday(p_slot_id uuid,p_date date) returns boolean language sql stable as $$ select exists(select 1 from statutory_holidays where holiday_date=p_date) or exists(select 1 from duty_slot_holiday_overrides where duty_slot_id=p_slot_id and duty_date=p_date and is_holiday) $$;
    create or replace function public.is_registrar_or_assigned_desk_admin(p_desk_id uuid) returns boolean language sql stable as $$ select exists(select 1 from profiles p join service_desks d on (d.primary_admin_id=p.id or d.secondary_admin_id=p.id) where p.id=auth.uid() and p.status='Approved' and (p.role='Registrar' or d.id=p_desk_id)) $$;
    grant usage on schema public,auth to authenticated,service_role;
  `);
  await db.exec(foundation);
  await db.exec(`create or replace function public.duty_slot_occurrence_dates(p_slot_id uuid,p_start date,p_end date,p_include_closed boolean default true) returns table(duty_date date) language sql stable as $$ select duty_date from public.scheduled_duty_slot_occurrence_dates(p_slot_id,p_start,p_end) $$;`);
  await db.exec(stage3b);
  await db.exec(stage3d);
  return db;
}

after(async () => { for (const db of dbs) await db.close(); });

test('Stage 3D migration executes against an isolated combined fixture', async () => {
  const db = await fixture();
  const rows = (await db.query(`select to_regclass('public.recurring_withdrawal_requests') as request_table, to_regprocedure('public.apply_duty_assignment_change(text,uuid,date,text,integer,date)') as member_rpc, to_regprocedure('public.apply_member_lifecycle_transition(uuid,text,app_role,account_status,app_role)') as lifecycle_rpc`)).rows[0];
  assert.equal(rows.request_table, 'recurring_withdrawal_requests');
  assert.ok(rows.member_rpc);
  assert.ok(rows.lifecycle_rpc);
});

test('Stage 3D SINGLE and ALL_FUTURE execute with durable records', async () => {
  const db = await fixture();
  const member='10000000-0000-0000-0000-000000000001', desk='10000000-0000-0000-0000-000000000002', slot='10000000-0000-0000-0000-000000000003', region='10000000-0000-0000-0000-000000000004';
  await db.query(`insert into profiles values($1,'Approved','Member','Member')`,[member]);
  await db.query(`insert into regions values($1,'Pacific/Auckland')`,[region]);
  await db.query(`insert into service_desks(id,name,region_id) values($1,'Desk',$2)`,[desk,region]);
  await db.query(`insert into duty_slots(id,desk_id,day_of_week,start_time,end_time) values($1,$2,extract(dow from date '2026-10-12')::int,'09:00','10:00')`,[slot,desk]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[member]);
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,'2026-10-12')`,[member,slot]);
  const single=(await db.query(`select apply_duty_assignment_change('WITHDRAW',$1,'2026-10-12','SINGLE') as result`,[slot])).rows[0].result;
  assert.equal(single.scope,'SINGLE');
  assert.equal((await db.query(`select count(*)::int n from duty_assignments`)).rows[0].n,0);
  await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE','2026-10-12')`,[member,slot]);
  const future=(await db.query(`select apply_duty_assignment_change('WITHDRAW',$1,'2026-10-12','ALL_FUTURE') as result`,[slot])).rows[0].result;
  assert.equal(future.scope,'ALL_FUTURE');
  assert.equal((await db.query(`select count(*)::int n from recurring_withdrawal_requests`)).rows[0].n,2);
});

async function seededMember() {
  const db=await fixture();
  const member='20000000-0000-0000-0000-000000000001', other='20000000-0000-0000-0000-000000000002', desk='20000000-0000-0000-0000-000000000003', slot='20000000-0000-0000-0000-000000000004', region='20000000-0000-0000-0000-000000000005';
  await db.query(`insert into profiles values($1,'Approved','Member','Member'),($2,'Approved','Member','Other')`,[member,other]);
  await db.query(`insert into regions values($1,'Pacific/Auckland')`,[region]);
  await db.query(`insert into service_desks(id,name,region_id) values($1,'Desk',$2)`,[desk,region]);
  await db.query(`insert into duty_slots(id,desk_id,day_of_week,start_time,end_time,max_jps) values($1,$2,1,'09:00','10:00',1)`,[slot,desk]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[member]);
  return {db,member,other,slot};
}

test('Stage 3D NEXT_N counts scheduled dates including unavailable dates', async () => {
  const {db,member,other,slot}=await seededMember();
  await db.query(`insert into statutory_holidays values('2026-10-19')`);
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,'2026-10-12'),($1,$2,'2026-10-26'),($3,$2,'2026-10-19'),($1,$2,'2026-11-02')`,[member,slot,other]);
  const result=(await db.query(`select apply_duty_assignment_change('WITHDRAW',$1,'2026-10-12','NEXT_N',3) as result`,[slot])).rows[0].result;
  assert.equal(result.affected_count,3);
  assert.deepEqual(result.affected_dates,['2026-10-12','2026-10-19','2026-10-26']);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where outcome='WITHDRAWN'`)).rows[0].n,3);
  assert.equal((await db.query(`select count(*)::int n from recurring_withdrawal_requests where scope='NEXT_N'`)).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and duty_date='2026-11-02'`,[member])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and duty_date='2026-10-19'`,[other])).rows[0].n,1);
});

test('Stage 3D UNTIL_DATE is inclusive and uses the preceding scheduled date', async () => {
  const {db,member,slot}=await seededMember();
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,'2026-10-12'),($1,$2,'2026-10-26')`,[member,slot]);
  const result=(await db.query(`select apply_duty_assignment_change('WITHDRAW',$1,'2026-10-12','UNTIL_DATE',null,'2026-10-30') as result`,[slot])).rows[0].result;
  assert.deepEqual(result.affected_dates,['2026-10-12','2026-10-19','2026-10-26']);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where outcome='WITHDRAWN'`)).rows[0].n,3);
  assert.equal((await db.query(`select count(*)::int n from recurring_withdrawal_requests where scope='UNTIL_DATE'`)).rows[0].n,1);
});

test('Stage 3D finite withdrawal suppresses materialisation and permits deliberate SINGLE override', async () => {
  const {db,member,slot}=await seededMember();
  await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE','2027-01-04')`,[member,slot]);
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,'2027-01-04'),($1,$2,'2027-01-11')`,[member,slot]);
  await db.query(`select apply_duty_assignment_change('WITHDRAW',$1,'2027-01-04','NEXT_N',2)`,[slot]);
  await db.query(`select materialize_recurring_duty_assignments(142)`);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and slot_id=$2 and duty_date='2027-01-04'`,[member,slot])).rows[0].n,0);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and slot_id=$2 and duty_date='2027-01-11'`,[member,slot])).rows[0].n,0);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and slot_id=$2 and duty_date='2027-01-18'`,[member,slot])).rows[0].n,1);
  await db.query(`select materialize_recurring_duty_assignments(142)`);
  const repeatedCount=(await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and slot_id=$2`,[member,slot])).rows[0].n;
  assert.ok(repeatedCount>1);
  assert.equal(repeatedCount,(await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and slot_id=$2`,[member,slot])).rows[0].n);
  const single=(await db.query(`select apply_duty_assignment_change('REGISTER',$1,'2027-01-04','SINGLE') as result`,[slot])).rows[0].result;
  assert.equal(single.action,'REGISTER');
  assert.equal((await db.query(`select count(*)::int n from recurring_withdrawal_overrides where profile_id=$1 and slot_id=$2 and duty_date='2027-01-04'`,[member,slot])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where outcome='WITHDRAWN'`,[])).rows[0].n,2);
});

test('Stage 3B recurring re-registration creates a new identity over finite withdrawal history', async () => {
  const {db,member,slot}=await seededMember();
  const oldRule=(await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE','2026-10-12') returning id`,[member,slot])).rows[0].id;
  await db.query(`insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created) values($1,$2,$3,'2026-10-12','BOOKED',false)`,[oldRule,member,slot]);
  await db.query(`select apply_duty_assignment_change('WITHDRAW',$1,'2026-10-12','NEXT_N',2)`,[slot]);
  const result=(await db.query(`select apply_recurring_registration($1,'2026-10-12','NEXT_N',2,null,'30000000-0000-0000-0000-000000000001') as result`,[slot])).rows[0].result;
  assert.equal(result.scope,'NEXT_N');
  assert.equal((await db.query(`select count(*)::int n from recurring_rules where profile_id=$1 and lifecycle_status='ACTIVE' and action='REGISTER'`,[member])).rows[0].n,1);
  assert.ok((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where profile_id=$1 and outcome='WITHDRAWN'`,[member])).rows[0].n>=2);
});

test('Stage 3D administrative withdrawal enforces Registrar and desk-admin scope', async () => {
  const {db,member,other,slot}=await seededMember();
  const registrar='20000000-0000-0000-0000-000000000010', admin='20000000-0000-0000-0000-000000000011', outsider='20000000-0000-0000-0000-000000000012';
  const otherDesk='20000000-0000-0000-0000-000000000013', otherSlot='20000000-0000-0000-0000-000000000014';
  await db.query(`update profiles set role='Registrar' where id=$1`,[registrar]).catch(async()=>await db.query(`insert into profiles values($1,'Approved','Registrar','Registrar')`,[registrar]));
  await db.query(`insert into profiles values($1,'Approved','Admin','Admin'),($2,'Approved','Admin','Outsider')`,[admin,outsider]);
  await db.query(`update service_desks set primary_admin_id=$1 where id=(select desk_id from duty_slots where id=$2)`,[admin,slot]);
  await db.query(`insert into service_desks(id,name,status,region_id) values($1,'Other','Active',(select region_id from service_desks limit 1))`,[otherDesk]);
  await db.query(`insert into duty_slots(id,desk_id,day_of_week,start_time,end_time) values($1,$2,1,'09:00','10:00')`,[otherSlot,otherDesk]);
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,'2026-10-12'),($1,$3,'2026-10-12')`,[member,slot,otherSlot]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[admin]);
  await assert.rejects(()=>db.query(`select apply_duty_assignment_change_for_member($1,'WITHDRAW',$2,'2026-10-12')`,[member,otherSlot]),/not authorised/i);
  const adminResult=(await db.query(`select apply_duty_assignment_change_for_member($1,'WITHDRAW',$2,'2026-10-12') as result`,[member,slot])).rows[0].result;
  assert.equal(adminResult.action,'WITHDRAW');
  assert.equal((await db.query(`select count(*)::int n from recurring_withdrawal_requests where requested_by=$1`,[admin])).rows[0].n,1);
  const repeated=(await db.query(`select apply_duty_assignment_change_for_member($1,'WITHDRAW',$2,'2026-10-12') as result`,[member,slot])).rows[0].result;
  assert.equal(repeated.request_id,adminResult.request_id);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[outsider]);
  await assert.rejects(()=>db.query(`select apply_duty_assignment_change_for_member($1,'WITHDRAW',$2,'2026-10-12')`,[member,otherSlot]),/not authorised/i);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[registrar]);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and slot_id=$2`,[member,otherSlot])).rows[0].n,1);
});

test('Stage 3D archive retains recurring history and reinstatement does not reactivate it', async () => {
  const {db,member,slot}=await seededMember();
  const registrar='20000000-0000-0000-0000-000000000020';
  await db.query(`insert into profiles values($1,'Approved','Registrar','Registrar')`,[registrar]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[registrar]);
  const rule=(await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE','2026-10-12') returning id`,[member,slot])).rows[0].id;
  await db.query(`insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created) values($1,$2,$3,'2026-10-12','BOOKED',true)`,[rule,member,slot]);
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,'2026-10-12'),($1,$2,'2026-01-05')`,[member,slot]);
  const archived=(await db.query(`select apply_member_lifecycle_transition($1,'ARCHIVE',null,'Approved','Member') as result`,[member])).rows[0].result;
  assert.equal(archived.status,'Archived');
  assert.equal((await db.query(`select count(*)::int n from recurring_rules where id=$1 and lifecycle_status='ENDED'`,[rule])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where recurring_rule_id=$1`,[rule])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and duty_date='2026-10-12'`,[member])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and duty_date='2026-01-05'`,[member])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from duty_assignment_cancellations where profile_id=$1`,[member])).rows[0].n,0);
  const reinstated=(await db.query(`select apply_member_lifecycle_transition($1,'REINSTATE','Member','Archived','Member') as result`,[member])).rows[0].result;
  assert.equal(reinstated.status,'Approved');
  assert.equal((await db.query(`select count(*)::int n from recurring_rules where id=$1 and lifecycle_status='ENDED'`,[rule])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1`,[member])).rows[0].n,2);
});

test('Stage 3D archive and reinstatement preserve historical statistics', async () => {
  const {db,member,slot}=await seededMember();
  const registrar='20000000-0000-0000-0000-000000000040';
  await db.query(`insert into profiles values($1,'Approved','Registrar','Registrar')`,[registrar]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[registrar]);
  const rule=(await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE','2026-01-05') returning id`,[member,slot])).rows[0].id;
  await db.query(`insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created) values($1,$2,$3,'2026-01-05','BOOKED',true),($1,$2,$3,'2026-10-12','BOOKED',true)`,[rule,member,slot]);
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,'2026-01-05'),($1,$2,'2026-10-12')`,[member,slot]);
  const stat=(await db.query(`insert into duty_statistics(profile_id,slot_id,duty_date,desk_name_snapshot,desk_code_snapshot,start_time_snapshot,end_time_snapshot,no_of_clients,no_of_hours_worked,certified_copies,statutory_declarations,signatures_witnessed,affidavits,other_duties,notes) values($1,$2,'2026-01-05','Desk','D1','09:00','12:00',7,3.5,2,1,4,0,5,'historical') returning id`,[member,slot])).rows[0].id;
  const before=(await db.query(`select * from duty_statistics where id=$1`,[stat])).rows[0];
  await db.query(`select apply_member_lifecycle_transition($1,'ARCHIVE',null,'Approved','Member')`,[member]);
  assert.deepEqual((await db.query(`select * from duty_statistics where id=$1`,[stat])).rows[0],before);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and duty_date='2026-01-05'`,[member])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1 and duty_date='2026-10-12'`,[member])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where recurring_rule_id=$1`,[rule])).rows[0].n,2);
  assert.equal((await db.query(`select count(*)::int n from recurring_rules where id=$1 and lifecycle_status='ENDED'`,[rule])).rows[0].n,1);
  await db.query(`select apply_member_lifecycle_transition($1,'REINSTATE','Member','Archived','Member')`,[member]);
  assert.deepEqual((await db.query(`select * from duty_statistics where id=$1`,[stat])).rows[0],before);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1`,[member])).rows[0].n,2);
  assert.equal((await db.query(`select count(*)::int n from recurring_rules where id=$1 and lifecycle_status='ENDED'`,[rule])).rows[0].n,1);
});

test('Stage 3D archive failure rolls back lifecycle and statistics state', async () => {
  const {db,member,slot}=await seededMember();
  const registrar='20000000-0000-0000-0000-000000000041';
  await db.query(`insert into profiles values($1,'Approved','Registrar','Registrar')`,[registrar]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[registrar]);
  await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE','2026-10-12')`,[member,slot]);
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,'2026-10-12')`,[member,slot]);
  await db.query(`insert into duty_statistics(profile_id,slot_id,duty_date,desk_name_snapshot,no_of_clients) values($1,$2,'2026-10-12','Desk',3)`,[member,slot]);
  await assert.rejects(()=>db.query(`select apply_member_lifecycle_transition($1,'ARCHIVE',null,'Rejected','Member')`,[member]),/changed since it was loaded/i);
  assert.equal((await db.query(`select status from profiles where id=$1`,[member])).rows[0].status,'Approved');
  assert.equal((await db.query(`select count(*)::int n from recurring_rules where profile_id=$1 and lifecycle_status='ACTIVE'`,[member])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1`,[member])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from duty_statistics where profile_id=$1`,[member])).rows[0].n,1);
});

test('Stage 3D ALL_FUTURE removes assignments beyond both materialisation horizons', async () => {
  const {db,member,other,slot}=await seededMember();
  const otherRule=(await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE','2026-10-12') returning id`,[other,slot])).rows[0].id;
  const ownRule=(await db.query(`insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date) values($1,$2,'REGISTER','ALL_FUTURE','2026-10-12') returning id`,[member,slot])).rows[0].id;
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,'2026-10-12'),($1,$2,'2027-10-18'),($3,$2,'2027-10-18')`,[member,slot,other]);
  const result=(await db.query(`select apply_duty_assignment_change('WITHDRAW',$1,'2026-10-12','ALL_FUTURE') as result`,[slot])).rows[0].result;
  assert.equal(result.cancelled_booking_count,2);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1`,[member])).rows[0].n,0);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1`,[other])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from recurring_rules where id=$1 and lifecycle_status='ENDED'`,[ownRule])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from recurring_rules where id=$1 and lifecycle_status='ACTIVE'`,[otherRule])).rows[0].n,1);
  assert.equal((await db.query(`select count(*)::int n from recurring_occurrence_outcomes where profile_id=$1`,[member])).rows[0].n,2);
});

test('Stage 3D secondary administrator and unauthenticated rejection paths', async () => {
  const {db,member,slot}=await seededMember();
  const secondary='20000000-0000-0000-0000-000000000030';
  await db.query(`insert into profiles values($1,'Approved','Admin','Secondary')`,[secondary]);
  await db.query(`update service_desks set secondary_admin_id=$1 where id=(select desk_id from duty_slots where id=$2)`,[secondary,slot]);
  await db.query(`insert into duty_assignments(profile_id,slot_id,duty_date) values($1,$2,'2026-10-12')`,[member,slot]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[secondary]);
  const result=(await db.query(`select apply_duty_assignment_change_for_member($1,'WITHDRAW',$2,'2026-10-12') as result`,[member,slot])).rows[0].result;
  assert.equal(result.action,'WITHDRAW');
  await db.query(`select set_config('request.jwt.claim.sub','',false)`);
  await assert.rejects(()=>db.query(`select apply_duty_assignment_change('WITHDRAW',$1,'2026-10-12','SINGLE')`,[slot]),/signed in|approved/i);
  await assert.rejects(()=>db.query(`select apply_duty_assignment_change_for_member($1,'WITHDRAW',$2,'2026-10-12')`,[member,slot]),/signed in|authorised|approved|invalid/i);
  await assert.rejects(()=>db.query(`select apply_member_lifecycle_transition($1,'ARCHIVE')`,[member]),/approved Registrar|signed in/i);
  assert.equal((await db.query(`select count(*)::int n from duty_assignments where profile_id=$1`,[member])).rows[0].n,0);
});
