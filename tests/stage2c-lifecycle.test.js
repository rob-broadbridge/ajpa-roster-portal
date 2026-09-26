import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260925_stage2c_account_lifecycle.sql', import.meta.url), 'utf8');

async function lifecycleDb() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create type account_status as enum ('Pending','Approved','Rejected','Archived'); create type app_role as enum ('Member','Admin','Registrar');
    create table profiles(id uuid primary key,status account_status not null,role app_role not null,full_name text,phone text,warrant_number text,is_provisional boolean default false);
    create table regions(id uuid primary key, timezone text); create table service_desks(id uuid primary key, name text, primary_admin_id uuid, secondary_admin_id uuid, region_id uuid references regions);
    create table duty_slots(id uuid primary key, desk_id uuid references service_desks, start_time time, end_time time);
    create table duty_assignments(profile_id uuid, slot_id uuid, duty_date date, primary key(profile_id,slot_id,duty_date));
    create table recurring_rules(profile_id uuid, slot_id uuid, action text, rule_type text, start_date date, count_n int);
    create table roster_activity_audit(id uuid default gen_random_uuid(),actor_profile_id uuid,subject_profile_id uuid,event_type text,previous_status text,new_status text,previous_role text,new_role text);
    grant usage on schema public,auth to authenticated;`);
  await db.exec(migration);
  await db.exec('grant select on profiles,service_desks,duty_assignments,recurring_rules,duty_assignment_cancellations,roster_activity_audit to authenticated;');
  return db;
}

test('Stage 2C lifecycle RPC executes real Pending approval and rejects invalid transition', async () => {
  const db = await lifecycleDb(); const registrar='00000000-0000-0000-0000-000000000001'; const pending='00000000-0000-0000-0000-000000000002';
  try {
    await db.query("insert into profiles values ($1,'Approved','Registrar','R'),($2,'Pending','Member','P')", [registrar,pending]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${registrar}',false);`);
    await db.query("select apply_member_lifecycle_transition($1,'APPROVE',null,'Pending','Member')", [pending]);
    assert.equal((await db.query('select status from profiles where id=$1',[pending])).rows[0].status,'Approved');
    await assert.rejects(() => db.query("select apply_member_lifecycle_transition($1,'APPROVE',null,'Approved','Member')", [pending]), /Invalid account status/);
  } finally { await db.close(); }
});

test('Stage 2C archive cancels future assignments, retains history, and clears desk administration', async () => {
  const db = await lifecycleDb();
  const registrar='00000000-0000-0000-0000-000000000011'; const member='00000000-0000-0000-0000-000000000012'; const other='00000000-0000-0000-0000-000000000013'; const region='00000000-0000-0000-0000-000000000014'; const desk='00000000-0000-0000-0000-000000000015'; const slot='00000000-0000-0000-0000-000000000016';
  try {
    await db.query("insert into profiles values ($1,'Approved','Registrar','R'),($2,'Approved','Admin','M'),($3,'Approved','Admin','O')", [registrar,member,other]);
    await db.query("insert into regions values ($1,'Pacific/Auckland')", [region]);
    await db.query("insert into service_desks values ($1,'Desk',$2,$3,$4)", [desk,member,other,region]);
    await db.query("insert into duty_slots values ($1,$2,'09:00','11:00')", [slot,desk]);
    await db.query("insert into duty_assignments values ($1,$2,'2099-01-04'),($1,$2,'2020-01-04'),($3,$2,'2099-01-04')", [member,slot,other]);
    await db.query("insert into recurring_rules values ($1,$2,'REGISTER','NEXT_N','2099-01-04',3)", [member,slot]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${registrar}',false);`);
    const result = await db.query("select apply_member_lifecycle_transition($1,'ARCHIVE',null,'Approved','Admin')", [member]);
    await db.exec('reset role;');
    assert.equal(result.rows[0].apply_member_lifecycle_transition.future_booking_count, 1);
    assert.equal(result.rows[0].apply_member_lifecycle_transition.desk_admin_assignment_count, 1);
    assert.equal((await db.query('select status from profiles where id=$1',[member])).rows[0].status,'Archived');
    assert.equal((await db.query('select count(*)::int as n from duty_assignments where profile_id=$1',[member])).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int as n from duty_assignments where profile_id=$1',[other])).rows[0].n,1);
    const cancellation = (await db.query("select profile_id,slot_id,duty_date::text,reason,cancelled_by from duty_assignment_cancellations where profile_id=$1",[member])).rows[0];
    assert.deepEqual(cancellation,{profile_id:member,slot_id:slot,duty_date:'2099-01-04',reason:'MEMBER_ARCHIVED',cancelled_by:registrar});
    assert.equal((await db.query('select count(*)::int as n from recurring_rules where profile_id=$1',[member])).rows[0].n,0);
    const deskState=(await db.query('select primary_admin_id,secondary_admin_id from service_desks where id=$1',[desk])).rows[0];
    assert.deepEqual(deskState,{primary_admin_id:null,secondary_admin_id:other});
    const audit=(await db.query("select event_type,previous_status,new_status,previous_role,new_role from roster_activity_audit where subject_profile_id=$1",[member])).rows[0];
    assert.deepEqual(audit,{event_type:'MEMBER_ARCHIVE',previous_status:'Approved',new_status:'Archived',previous_role:'Admin',new_role:'Admin'});
  } finally { await db.close(); }
});

test('Stage 2C Pending/Rejected lifecycle transitions execute and preserve role', async () => {
  const db = await lifecycleDb(); const r='00000000-0000-0000-0000-000000000021'; const p='00000000-0000-0000-0000-000000000022'; const q='00000000-0000-0000-0000-000000000023';
  try { await db.query("insert into profiles values ($1,'Approved','Registrar','R'),($2,'Pending','Member','P'),($3,'Rejected','Member','Q')",[r,p,q]); await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${r}',false);`);
    await db.query("select apply_member_lifecycle_transition($1,'REJECT',null,'Pending','Member')",[p]); await db.query("select apply_member_lifecycle_transition($1,'RECONSIDER',null,'Rejected','Member')",[q]); await db.exec('reset role;');
    assert.equal((await db.query('select status from profiles where id=$1',[p])).rows[0].status,'Rejected'); assert.equal((await db.query('select status from profiles where id=$1',[q])).rows[0].status,'Pending');
    assert.equal((await db.query("select count(*)::int as n from roster_activity_audit where event_type in ('MEMBER_REJECT','MEMBER_RECONSIDER')")).rows[0].n,2);
  } finally { await db.close(); }
});

test('Stage 2C reinstatement requires an explicit role and never restores archived state', async () => {
  const db = await lifecycleDb(); const r='00000000-0000-0000-0000-000000000031'; const m='00000000-0000-0000-0000-000000000032'; const s='00000000-0000-0000-0000-000000000033'; const d='00000000-0000-0000-0000-000000000034'; const slot='00000000-0000-0000-0000-000000000035';
  try { await db.query("insert into profiles values ($1,'Approved','Registrar','R'),($2,'Archived','Member','M')",[r,m]); await db.query("insert into regions values ($1,'Pacific/Auckland')",[s]); await db.query("insert into service_desks values ($1,'D',null,null,$2)",[d,s]); await db.query("insert into duty_slots values ($1,$2,'09:00','11:00')",[slot,d]); await db.query("insert into duty_assignment_cancellations(profile_id,slot_id,duty_date,reason) values ($1,$2,'2099-01-01','MEMBER_ARCHIVED')",[m,slot]); await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${r}',false);`);
    await assert.rejects(()=>db.query("select apply_member_lifecycle_transition($1,'REINSTATE',null,'Archived','Member')",[m]),/explicit role/); await db.query("select apply_member_lifecycle_transition($1,'REINSTATE','Admin','Archived','Member')",[m]); await db.exec('reset role;');
    const profile=(await db.query('select status,role from profiles where id=$1',[m])).rows[0]; assert.deepEqual(profile,{status:'Approved',role:'Admin'}); assert.equal((await db.query('select count(*)::int as n from duty_assignments where profile_id=$1',[m])).rows[0].n,0); assert.equal((await db.query('select count(*)::int as n from recurring_rules where profile_id=$1',[m])).rows[0].n,0); assert.equal((await db.query('select primary_admin_id from service_desks where id=$1',[d])).rows[0].primary_admin_id,null);
  } finally { await db.close(); }
});

test('Stage 2C role transitions, authority and last Registrar protection execute behaviorally', async () => {
  const db = await lifecycleDb(); const r1='00000000-0000-0000-0000-000000000041'; const r2='00000000-0000-0000-0000-000000000042'; const a='00000000-0000-0000-0000-000000000043'; const m='00000000-0000-0000-0000-000000000044';
  try { await db.query("insert into profiles values ($1,'Approved','Registrar','R1'),($2,'Approved','Registrar','R2'),($3,'Approved','Admin','A'),($4,'Approved','Member','M')",[r1,r2,a,m]); await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${r1}',false);`);
    await db.query("select apply_member_lifecycle_transition($1,'CHANGE_ROLE','Member','Approved','Registrar')",[r2]); await db.query("select apply_member_lifecycle_transition($1,'CHANGE_ROLE','Member','Approved','Member')",[m]); await db.query("select apply_member_lifecycle_transition($1,'CHANGE_ROLE','Member','Approved','Admin')",[a]);
    await assert.rejects(()=>db.query("select apply_member_lifecycle_transition($1,'ARCHIVE',null,'Approved','Registrar')",[r1]),/last approved Registrar/); await db.exec('reset role;');
    const rows=(await db.query('select id,role from profiles where id in ($1,$2,$3)',[r1,r2,a])).rows; assert.equal(rows.find(x=>x.id===r1).role,'Registrar'); assert.equal(rows.find(x=>x.id===r2).role,'Member'); assert.equal(rows.find(x=>x.id===a).role,'Member');
  } finally { await db.close(); }
});

test('Stage 2C update_member_profile_and_role commits profile details and Member to Admin atomically', async () => {
  const db=await lifecycleDb(); const r='00000000-0000-0000-0000-000000000051'; const m='00000000-0000-0000-0000-000000000052';
  try { await db.query("insert into profiles(id,status,role,full_name,phone,warrant_number,is_provisional) values ($1,'Approved','Registrar','R','1','JP-1',false),($2,'Approved','Member','Old','1','JP-1',false)",[r,m]); await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${r}',false);`);
    await db.query("select update_member_profile_and_role($1,'New','2','JP-2',true,'Admin','Approved','Member')",[m]); await db.exec('reset role;');
    assert.deepEqual((await db.query('select full_name,phone,warrant_number,is_provisional,status,role from profiles where id=$1',[m])).rows[0],{full_name:'New',phone:'2',warrant_number:'JP-2',is_provisional:true,status:'Approved',role:'Admin'});
  } finally { await db.close(); }
});

test('Stage 2C atomic profile save rolls back on last Registrar and stale state failures', async () => {
  const db=await lifecycleDb(); const r='00000000-0000-0000-0000-000000000061'; const m='00000000-0000-0000-0000-000000000062';
  try { await db.query("insert into profiles(id,status,role,full_name,phone,warrant_number) values ($1,'Approved','Registrar','R','1','JP-1'),($2,'Approved','Member','M','2','JP-2')",[r,m]); await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${r}',false);`);
    await assert.rejects(()=>db.query("select update_member_profile_and_role($1,'Changed','9','JP-9',true,'Member','Approved','Registrar')",[r]),/last approved Registrar/);
    assert.deepEqual((await db.query('select full_name,phone,warrant_number,is_provisional from profiles where id=$1',[r])).rows[0],{full_name:'R',phone:'1',warrant_number:'JP-1',is_provisional:false});
    await db.exec('reset role;'); await db.query("update profiles set status='Rejected' where id=$1",[m]); await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${r}',false);`); await assert.rejects(()=>db.query("select update_member_profile_and_role($1,'Stale','8','JP-8',true,'Admin','Approved','Member')",[m]),/changed since/); await db.exec('reset role;');
    assert.deepEqual((await db.query('select full_name,phone,warrant_number,status,role from profiles where id=$1',[m])).rows[0],{full_name:'M',phone:'2',warrant_number:'JP-2',status:'Rejected',role:'Member'});
  } finally { await db.close(); }
});

test('Stage 2C Admin to Member profile save clears desk administration atomically', async () => {
  const db=await lifecycleDb(); const r='00000000-0000-0000-0000-000000000071'; const a='00000000-0000-0000-0000-000000000072'; const o='00000000-0000-0000-0000-000000000073'; const region='00000000-0000-0000-0000-000000000074'; const d='00000000-0000-0000-0000-000000000075';
  try { await db.query("insert into profiles values ($1,'Approved','Registrar','R'),($2,'Approved','Admin','A'),($3,'Approved','Admin','O')",[r,a,o]); await db.query("insert into regions values ($1,'Pacific/Auckland')",[region]); await db.query("insert into service_desks values ($1,'D',$2,$3,$4)",[d,a,o,region]); await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${r}',false);`); await db.query("select update_member_profile_and_role($1,'A2','3','JP-3',true,'Member','Approved','Admin')",[a]); await db.exec('reset role;');
    assert.deepEqual((await db.query('select role,full_name,phone from profiles where id=$1',[a])).rows[0],{role:'Member',full_name:'A2',phone:'3'}); assert.deepEqual((await db.query('select primary_admin_id,secondary_admin_id from service_desks where id=$1',[d])).rows[0],{primary_admin_id:null,secondary_admin_id:o});
  } finally { await db.close(); }
});

test('Stage 2C migration uses composite assignment identity and reusable cancellation history', () => {
  assert.match(migration, /create table if not exists public\.duty_assignment_cancellations/);
  assert.match(migration, /profile_id uuid not null/);
  assert.match(migration, /unique\(profile_id,\s*slot_id,\s*duty_date\)/);
  assert.match(migration, /MEMBER_ARCHIVED/);
  assert.doesNotMatch(migration, /where id=v_assignment\.id/);
});

test('Stage 2C migration preserves local-time start cutoff and historical assignments', () => {
  assert.match(migration, /duty_date\+s\.start_time > timezone\(coalesce\(r\.timezone,'Pacific\/Auckland'\),now\(\)\)/);
  assert.match(migration, /delete from duty_assignments where profile_id=p_member_id and slot_id=v_assignment\.slot_id and duty_date=v_assignment\.duty_date/);
});

test('Stage 2C migration serializes lifecycle operations and records Activity Log transitions', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('ajpa-stage2c-lifecycle',0\)\)/);
  assert.match(migration, /previous_status/);
  assert.match(migration, /new_status/);
  assert.match(migration, /previous_role/);
  assert.match(migration, /new_role/);
});
