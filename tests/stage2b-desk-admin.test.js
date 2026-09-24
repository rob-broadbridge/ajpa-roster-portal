import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20260924100000_stage2b_desk_administrator_succession.sql', import.meta.url), 'utf8');
const ids = { admin1: '00000000-0000-0000-0000-000000000001', admin2: '00000000-0000-0000-0000-000000000002', registrar: '00000000-0000-0000-0000-000000000003', member: '00000000-0000-0000-0000-000000000004', pending: '00000000-0000-0000-0000-000000000005', rejected: '00000000-0000-0000-0000-000000000006', archived: '00000000-0000-0000-0000-000000000007', desk: '00000000-0000-0000-0000-000000000010', region: '00000000-0000-0000-0000-000000000011' };

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create type account_status as enum ('Pending','Approved','Rejected','Archived'); create type app_role as enum ('Member','Admin','Registrar');
    create table profiles(id uuid primary key,status account_status not null,role app_role not null,full_name text,warrant_number text,email text,phone text,is_provisional boolean default false,desk_admin_reminder_frequency text,desk_admin_reminder_start_date date,desk_admin_reminder_weeks integer);
    create table regions(id uuid primary key); create table service_desks(id uuid primary key default (md5(random()::text || clock_timestamp()::text)::uuid), code text, name text, address text, region_id uuid references regions, primary_admin_id uuid, secondary_admin_id uuid, site_contact_name text, site_contact_email text, contact_person text, notes text, status text default 'Active', updated_at timestamptz default now());
    alter table profiles enable row level security; alter table service_desks enable row level security;
    create function is_approved_registrar() returns boolean language sql security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and status='Approved' and role='Registrar') $$;
    create function is_registrar_or_assigned_desk_admin(p_desk_id uuid) returns boolean language sql security definer set search_path=public as $$ select is_approved_registrar() or exists(select 1 from service_desks d join profiles p on p.id=auth.uid() where d.id=p_desk_id and p.status='Approved' and p.role='Admin' and (d.primary_admin_id=p.id or d.secondary_admin_id=p.id)) $$;
    create policy registrar_or_assigned_admin_manage_desks on service_desks for update to authenticated using (is_registrar_or_assigned_desk_admin(id)) with check (is_registrar_or_assigned_desk_admin(id));
    grant usage on schema public,auth to authenticated,service_role; grant select,insert on profiles,regions to authenticated,service_role; grant select on service_desks to authenticated,service_role; grant update (code,name,address,region_id,site_contact_name,site_contact_email,contact_person,notes) on service_desks to authenticated; grant insert,update on service_desks to service_role;`);
  await db.exec(migration);
  await db.query('insert into regions values ($1)', [ids.region]);
  await db.query("insert into profiles(id,status,role,full_name) values ($1,$2,$3,'Admin 1'),($4,$2,$3,'Admin 2'),($5,$2,$6,'Registrar'),($7,$2,'Member','Member'),($8,'Pending','Admin','Pending'),($9,'Rejected','Admin','Rejected'),($10,'Archived','Admin','Archived')", [ids.admin1,'Approved','Admin',ids.admin2,ids.registrar,'Registrar',ids.member,ids.pending,ids.rejected,ids.archived]);
  await db.query('insert into service_desks(id,code,name,address,region_id,primary_admin_id,secondary_admin_id) values ($1,$2,$3,$4,$5,$6,$7)', [ids.desk,'D1','Desk 1','Address',ids.region,ids.admin1,ids.admin2]);
  return db;
}

async function as(db, actor, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false);`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}

test('Stage 2B administrator succession enforces authority, roles, vacancies and stale edits', async () => {
  const db = await setup();
  try {
    const call = (actor, primary, secondary, expectedPrimary = ids.admin1, expectedSecondary = ids.admin2) => as(db, actor, 'select * from update_service_desk_with_administrators($1,$2,$3,$4,$5,$6,$7,$8,$9)', [ids.desk,'D1','Desk 1','Address',ids.region,primary,secondary,expectedPrimary,expectedSecondary]);
    await assert.rejects(() => call(ids.member, ids.admin2, null), /assigned Admin/);
    for (const inactive of [ids.pending, ids.rejected, ids.archived]) await assert.rejects(() => call(inactive, ids.admin2, null), /approved account|assigned Admin/);
    await assert.rejects(() => call(ids.registrar, ids.registrar, null), /approved Admin/);
    await assert.rejects(() => call(ids.admin1, ids.admin1, ids.admin1), /different people/);
    await call(ids.admin2, ids.admin2, ids.admin1);
    await call(ids.admin1, ids.admin1, null, ids.admin2, ids.admin1);
    await assert.rejects(() => call(ids.admin1, null, null, ids.admin1, null), /may remove/);
    await assert.rejects(() => call(ids.admin1, ids.admin2, null, ids.admin2, ids.admin1), /changed since/);
    await call(ids.registrar, null, null, ids.admin1, null);
    await call(ids.registrar, ids.admin2, null, null, null);
    await assert.rejects(() => as(db, ids.admin1, 'update service_desks set primary_admin_id=$1 where id=$2', [ids.admin1, ids.desk]), /permission denied/);
    await assert.rejects(() => as(db, ids.registrar, 'update service_desks set secondary_admin_id=$1 where id=$2', [ids.admin1, ids.desk]), /permission denied/);
    await assert.rejects(() => as(db, ids.admin1, 'select create_service_desk_for_current_user($1,$2,$3,$4,$5,$6)', ['D2','Desk 2','Address',ids.region,ids.admin1,null]), /approved Registrar/);
    await assert.rejects(() => as(db, ids.registrar, 'insert into service_desks(code,name,address,region_id) values ($1,$2,$3,$4)', ['BAD','Bad','Bad',ids.region]), /permission denied/);
    const created = await as(db, ids.registrar, 'select create_service_desk_for_current_user($1,$2,$3,$4,$5,$6)', ['D2','Desk 2','Address',ids.region,null,null]);
    assert.ok(created.rows[0].create_service_desk_for_current_user);
    const atomic = await as(db, ids.admin2, 'select * from update_service_desk_with_administrators($1,$2,$3,$4,$5,$6,$7,$8,$9)', [ids.desk,'D1X','Updated','New address',ids.region,null,ids.admin2,ids.admin2,null]);
    assert.equal(atomic.rows[0].code, 'D1X');
    assert.equal(atomic.rows[0].primary_admin_id, null);
    await assert.rejects(() => as(db, ids.admin2, 'select * from update_service_desk_with_administrators($1,$2,$3,$4,$5,$6,$7,$8,$9)', [ids.desk,'BAD','Bad','Bad',ids.region,ids.admin2,null, ids.admin2, null]), /changed since/);
    const unchanged = await db.query('select code, name, primary_admin_id, secondary_admin_id from service_desks where id=$1', [ids.desk]);
    assert.deepEqual(unchanged.rows[0], { code: 'D1X', name: 'Updated', primary_admin_id: null, secondary_admin_id: ids.admin2 });
  } finally { await db.close(); }
});

test('failed desk saves explicitly retain the Service Desks edit view', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const failureBranch = app.slice(app.indexOf("const message = error.code === '40001'"), app.indexOf('    if (error) {', app.indexOf("const message = error.code === '40001'") + 1));
  assert.doesNotMatch(failureBranch, /setActiveTab\('calendar'\)/);
  assert.match(failureBranch, /setEditingDeskId\(refreshedDesk\.id\)/);
  assert.match(failureBranch, /refreshedRoster\.desks\.find/);
});
