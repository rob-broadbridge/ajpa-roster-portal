import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260927_stage3a_recurring_occurrence_foundation.sql', import.meta.url), 'utf8');
const compatibility = fs.readFileSync(new URL('../supabase/migrations/20260927_stage3a_lifecycle_compatibility.sql', import.meta.url), 'utf8');

async function dbForStage3A() {
  const db = new PGlite();
  await db.exec(`create table profiles(id uuid primary key);
    create table regions(id uuid primary key, timezone text not null);
    create table service_desks(id uuid primary key, status text not null default 'Active', region_id uuid references regions);
    create table duty_slots(id uuid primary key, desk_id uuid references service_desks, day_of_week smallint not null, effective_from date not null default current_date, status text not null default 'Active');
    create table duty_assignments(profile_id uuid, slot_id uuid, duty_date date, primary key(profile_id,slot_id,duty_date));
    create type rule_action as enum ('REGISTER','WITHDRAW');
    create type rule_type as enum ('SINGLE','NEXT_N','UNTIL_DATE','ALL_FUTURE');
    create table recurring_rules(id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id), slot_id uuid not null references duty_slots(id), action rule_action not null, rule_type rule_type not null, start_date date not null, until_date date, count_n integer, created_at timestamptz not null default now());
    create role anon; create role authenticated; create role service_role;`);
  await db.exec(migration);
  return db;
}

test('calendar helper counts scheduled dates without holiday/bookability filtering', async () => {
  const db = await dbForStage3A();
  try {
    await db.exec("insert into profiles values ('00000000-0000-0000-0000-000000000001'); insert into service_desks values ('00000000-0000-0000-0000-000000000002','Active'); insert into duty_slots(id,desk_id,day_of_week,effective_from) values ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002',2,'2026-09-01');");
    const rows = (await db.query("select duty_date::text from scheduled_duty_slot_occurrence_dates('00000000-0000-0000-0000-000000000003','2026-09-01','2026-09-30')")).rows;
    assert.deepEqual(rows.map(row => row.duty_date), ['2026-09-01','2026-09-08','2026-09-15','2026-09-22','2026-09-29']);
  } finally { await db.close(); }
});

test('NEXT_N uses the fixed first N calendar occurrences', async () => {
  const db = await dbForStage3A();
  try {
    const d='00000000-0000-0000-0000-000000000004', s='00000000-0000-0000-0000-000000000005';
    await db.query("insert into service_desks values ($1,'Active')",[d]); await db.query("insert into duty_slots(id,desk_id,day_of_week,effective_from) values ($1,$2,2,'2026-09-01')",[s,d]);
    const dates=(await db.query("select duty_date::text from scheduled_duty_slot_occurrence_dates($1,'2026-09-01','2026-12-31') limit 4",[s])).rows.map(row=>row.duty_date);
    assert.deepEqual(dates,['2026-09-01','2026-09-08','2026-09-15','2026-09-22']);
  } finally { await db.close(); }
});

test('holiday and closure conditions do not remove scheduled calendar dates', async () => {
  const db = await dbForStage3A();
  try {
    const d='00000000-0000-0000-0000-000000000006', s='00000000-0000-0000-0000-000000000007';
    await db.query("insert into service_desks values ($1,'Active')",[d]); await db.query("insert into duty_slots(id,desk_id,day_of_week,effective_from) values ($1,$2,2,'2026-09-01')",[s,d]);
    await db.exec("create table statutory_holidays(holiday_date date primary key); create table occurrence_closures(slot_id uuid, duty_date date, primary key(slot_id,duty_date)); insert into statutory_holidays values ('2026-09-08'); insert into occurrence_closures values ('00000000-0000-0000-0000-000000000007','2026-09-15');");
    const dates=(await db.query("select duty_date::text from scheduled_duty_slot_occurrence_dates($1,'2026-09-01','2026-09-22')",[s])).rows.map(row=>row.duty_date);
    assert.deepEqual(dates,['2026-09-01','2026-09-08','2026-09-15','2026-09-22']);
  } finally { await db.close(); }
});

test('date ranges are inclusive and a non-weekday end uses the prior occurrence', async () => {
  const db = await dbForStage3A();
  try {
    const d='00000000-0000-0000-0000-000000000008', s='00000000-0000-0000-0000-000000000009';
    await db.query("insert into service_desks values ($1,'Active')",[d]); await db.query("insert into duty_slots(id,desk_id,day_of_week,effective_from) values ($1,$2,2,'2026-09-01')",[s,d]);
    const dates=(await db.query("select duty_date::text from scheduled_duty_slot_occurrence_dates($1,'2026-09-08','2026-09-20')",[s])).rows.map(row=>row.duty_date);
    assert.deepEqual(dates,['2026-09-08','2026-09-15']);
  } finally { await db.close(); }
});

test('desk region timezone retains local calendar dates across the Auckland DST boundary', async () => {
  const db = await dbForStage3A();
  try {
    const r='00000000-0000-0000-0000-000000000010', d='00000000-0000-0000-0000-000000000016', s='00000000-0000-0000-0000-000000000017';
    await db.query("insert into regions values ($1,'Pacific/Auckland')",[r]); await db.query("insert into service_desks(id,status,region_id) values ($1,'Active',$2)",[d,r]); await db.query("insert into duty_slots(id,desk_id,day_of_week,effective_from) values ($1,$2,0,'2026-09-20')",[s,d]);
    const dates=(await db.query("select duty_date::text from scheduled_duty_slot_occurrence_dates($1,'2026-09-20','2026-10-11')",[s])).rows.map(row=>row.duty_date);
    assert.deepEqual(dates,['2026-09-20','2026-09-27','2026-10-04','2026-10-11']);
  } finally { await db.close(); }
});

test('calendar helper respects effective-from and inclusive requested boundaries', async () => {
  const db = await dbForStage3A();
  try {
    const d='00000000-0000-0000-0000-000000000032', s='00000000-0000-0000-0000-000000000033';
    await db.query("insert into service_desks values ($1,'Active')",[d]);
    await db.query("insert into duty_slots(id,desk_id,day_of_week,effective_from) values ($1,$2,1,'2026-09-14')",[s,d]);
    const rows=(await db.query("select duty_date::text from scheduled_duty_slot_occurrence_dates($1,'2026-09-01','2026-09-28')",[s])).rows;
    assert.deepEqual(rows.map(row => row.duty_date),['2026-09-14','2026-09-21','2026-09-28']);
  } finally { await db.close(); }
});

test('outcomes are unique and retain superseded rule history', async () => {
  const db = await dbForStage3A();
  try {
    const p='00000000-0000-0000-0000-000000000011', d='00000000-0000-0000-0000-000000000012', s='00000000-0000-0000-0000-000000000013', r1='00000000-0000-0000-0000-000000000014', r2='00000000-0000-0000-0000-000000000015';
    await db.query('insert into profiles values ($1)',[p]); await db.query("insert into service_desks values ($1,'Active')",[d]); await db.query("insert into duty_slots(id,desk_id,day_of_week) values ($1,$2,1)",[s,d]); await db.query("insert into recurring_rules(id,profile_id,slot_id,action,rule_type,start_date) values ($1,$2,$3,'REGISTER','ALL_FUTURE','2026-09-07')",[r1,p,s]); await db.query("insert into recurring_rules(id,profile_id,slot_id,action,rule_type,start_date) values ($1,$2,$3,'WITHDRAW','NEXT_N','2026-09-07')",[r2,p,s]);
    await db.query("insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created) values ($1,$2,$3,'2026-09-07','FULL',null)",[r1,p,s]);
    await assert.rejects(() => db.query("insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created) values ($1,$2,$3,'2026-09-07','FULL',null)",[r1,p,s]));
    await db.query("update recurring_rules set lifecycle_status='SUPERSEDED',superseded_by=$2,superseded_at=now() where id=$1",[r1,r2]);
    await db.query("insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created) values ($1,$2,$3,'2026-09-07','WITHDRAWN',null)",[r2,p,s]);
    assert.equal((await db.query('select count(*)::int as n from recurring_occurrence_outcomes where recurring_rule_id=$1',[r1])).rows[0].n,1);
    assert.equal((await db.query('select outcome from recurring_occurrence_outcomes where recurring_rule_id=$1',[r1])).rows[0].outcome,'FULL');
    assert.equal((await db.query('select outcome from recurring_occurrence_outcomes where recurring_rule_id=$1',[r2])).rows[0].outcome,'WITHDRAWN');
  } finally { await db.close(); }
});

test('active REGISTER uniqueness prevents a second active series', async () => {
  const db = await dbForStage3A();
  try {
    const p='00000000-0000-0000-0000-000000000021', d='00000000-0000-0000-0000-000000000022', s='00000000-0000-0000-0000-000000000023', r1='00000000-0000-0000-0000-000000000024', r2='00000000-0000-0000-0000-000000000025';
    await db.query('insert into profiles values ($1)',[p]); await db.query("insert into service_desks values ($1,'Active')",[d]); await db.query("insert into duty_slots(id,desk_id,day_of_week) values ($1,$2,1)",[s,d]); await db.query("insert into recurring_rules(id,profile_id,slot_id,action,rule_type,start_date) values ($1,$2,$3,'REGISTER','ALL_FUTURE','2026-09-07')",[r1,p,s]);
    await assert.rejects(() => db.query("insert into recurring_rules(id,profile_id,slot_id,action,rule_type,start_date) values ($1,$2,$3,'REGISTER','ALL_FUTURE','2026-09-14')",[r2,p,s]));
  } finally { await db.close(); }
});

test('migration defines durable exception outcomes without requiring assignments', () => {
  for (const reason of ['FULL','STATUTORY_HOLIDAY','DESK_CLOSED','MEMBER_INELIGIBLE','OTHER_UNAVAILABLE','WITHDRAWN']) assert.match(migration, new RegExp(`'${reason}'`));
  assert.doesNotMatch(migration, /ALREADY_BOOKED/);
});

test('BOOKED outcomes require a source flag while exceptions and WITHDRAWN do not', async () => {
  const db = await dbForStage3A();
  try {
    const p='00000000-0000-0000-0000-000000000041', d='00000000-0000-0000-0000-000000000042', s='00000000-0000-0000-0000-000000000043', r='00000000-0000-0000-0000-000000000044';
    await db.query('insert into profiles values ($1)',[p]); await db.query("insert into service_desks values ($1,'Active')",[d]); await db.query("insert into duty_slots(id,desk_id,day_of_week) values ($1,$2,1)",[s,d]); await db.query("insert into recurring_rules(id,profile_id,slot_id,action,rule_type,start_date) values ($1,$2,$3,'WITHDRAW','NEXT_N','2026-09-07')",[r,p,s]);
    await db.query("insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome) values ($1,$2,$3,'2026-09-07','WITHDRAWN')",[r,p,s]);
    await assert.rejects(() => db.query("insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome) values ($1,$2,$3,'2026-09-14','BOOKED')",[r,p,s]));
  } finally { await db.close(); }
});

test('all-exception recurring requests remain valid without duty assignments', async () => {
  const db = await dbForStage3A();
  try {
    const p='00000000-0000-0000-0000-000000000051', d='00000000-0000-0000-0000-000000000052', s='00000000-0000-0000-0000-000000000053', r='00000000-0000-0000-0000-000000000054';
    await db.query('insert into profiles values ($1)',[p]); await db.query("insert into service_desks values ($1,'Active')",[d]); await db.query("insert into duty_slots(id,desk_id,day_of_week) values ($1,$2,1)",[s,d]); await db.query("insert into recurring_rules(id,profile_id,slot_id,action,rule_type,start_date,count_n) values ($1,$2,$3,'REGISTER','NEXT_N','2026-09-07',4)",[r,p,s]);
    for (const [i, outcome] of ['FULL','STATUTORY_HOLIDAY','DESK_CLOSED','OTHER_UNAVAILABLE'].entries()) await db.query("insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome) values ($1,$2,$3,$4,$5)",[r,p,s,`2026-09-${String(7+i*7).padStart(2,'0')}`,outcome]);
    assert.equal((await db.query('select count(*)::int as n from duty_assignments where profile_id=$1 and slot_id=$2',[p,s])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from recurring_occurrence_outcomes where recurring_rule_id=$1',[r])).rows[0].n,4);
  } finally { await db.close(); }
});

test('lifecycle compatibility ends historical rules and filters inactive materialisation', () => {
  assert.match(compatibility, /update recurring_rules set lifecycle_status='ENDED'/);
  assert.match(compatibility, /where lifecycle_status='ACTIVE'/);
  assert.match(compatibility, /for v_rule in select \* from public\.recurring_rules where lifecycle_status='ACTIVE'/);
  assert.match(compatibility, /pg_advisory_xact_lock\(hashtextextended\('ajpa-stage2c-lifecycle',0\)\)/);
});
