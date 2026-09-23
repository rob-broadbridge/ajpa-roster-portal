import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// In-memory PostgreSQL only. No Supabase client, environment credentials,
// network extensions, notification triggers, historical migrations or real rows.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/stage2a-baseline.json', import.meta.url)));
const migration = readFileSync(new URL('../supabase/migrations/20260923120000_stage2a_eligibility_and_pending_access.sql', import.meta.url), 'utf8');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const actors = ['Pending', 'Approved', 'Rejected', 'Archived'].flatMap((status, i) =>
  ['Member', 'Admin', 'Registrar'].map((role, j) => ({ status, role, id: id(i * 3 + j + 1) })));
let db;

async function baseline() {
  const pg = new PGlite();
  try {
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema cron;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, confirmation_token text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create type account_status as enum ('Pending','Approved','Rejected','Archived');
    create type app_role as enum ('Member','Admin','Registrar');
    create type rule_action as enum ('REGISTER','WITHDRAW');
    create type rule_type as enum ('SINGLE','NEXT_N','UNTIL_DATE','ALL_FUTURE');`);
  for (const table of new Set(fixture.columns.map(c => c.object_name))) {
    const columns = fixture.columns.filter(c => c.object_name === table).sort((a,b) => +a.position - +b.position);
    await pg.exec(`create table public.${quote(table)} (${columns.map(c => `${quote(c.column_name)} ${c.data_type}${c.not_null === 'true' ? ' not null' : ''}${c.default_or_generation_expression && c.default_or_generation_expression !== 'null' ? ` default ${c.default_or_generation_expression}` : ''}`).join(',')}); alter table public.${quote(table)} enable row level security;`);
  }
  for (const constraint of [...fixture.constraints].sort((a,b) => Number(a.contype === 'f') - Number(b.contype === 'f'))) {
    await pg.exec(`alter table public.${quote(constraint.table_name)} add constraint ${quote(constraint.conname)} ${constraint.definition};`);
  }
  // SQL functions depend on helpers declared later in the exported listing.
  await pg.exec('set check_function_bodies = off;');
  for (const fn of fixture.functions) await pg.exec(fn.definition);
  for (const fn of fixture.functions) await pg.exec(`revoke all on function public.${fn.function_signature} from public,anon,authenticated,service_role;`);
  for (const grant of fixture.functionGrants) {
    if (grant.effective_execute === 'true') await pg.exec(`grant execute on function public.${grant.function_signature} to ${grant.checked_role};`);
    if (grant.public_execute === 'true') await pg.exec(`grant execute on function public.${grant.function_signature} to public;`);
  }
  await pg.exec('set check_function_bodies = on;');
  for (const p of fixture.policies) {
    await pg.exec(`create policy ${quote(p.policyname)} on public.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.slice(1,-1)}${p.using_expression !== 'null' ? ` using (${p.using_expression})` : ''}${p.check_expression !== 'null' ? ` with check (${p.check_expression})` : ''};`);
  }
  for (const grant of fixture.grants) {
    const privileges = Object.entries({ SELECT: 'can_select', INSERT: 'can_insert', UPDATE: 'can_update', DELETE: 'can_delete', TRUNCATE: 'can_truncate', REFERENCES: 'can_reference', TRIGGER: 'can_create_trigger' }).filter(([,key]) => grant[key] === 'true').map(([key]) => key);
    if (privileges.length) await pg.exec(`grant ${privileges.join(',')} on public.${quote(grant.object_name)} to ${grant.rolname};`);
  }
  await pg.exec(`create trigger normalise_warrant before insert or update of warrant_number on profiles for each row execute function normalise_jp_warrant_number();`);
  return pg;
  } catch (error) { await pg.close(); throw error; }
}

before(async () => {
  db = await baseline();
  await db.exec(migration);
  for (const actor of actors) {
    await db.query('insert into auth.users values ($1,$2,null,$3)', [actor.id, `${actor.id}@example.invalid`, 'local-token']);
    await db.query('insert into profiles(id,full_name,email,warrant_number,status,role) values ($1,$2,$3,$4,$5,$6)', [actor.id, `${actor.status} ${actor.role}`, `${actor.id}@example.invalid`, `JP-${actors.indexOf(actor)+1}`, actor.status, actor.role]);
  }
  await db.exec(`insert into regions(id,name,code) values ('${id(100)}','Local test','TEST');`);
  for (let n=1; n<=3; n++) {
    await db.exec(`insert into service_desks(id,name,code,region_id,primary_admin_id,secondary_admin_id) values ('${id(100+n)}','Desk ${n}','D${n}','${id(100)}','${id(n===1?5:2)}',${n===3 ? `'${id(5)}'` : 'null'});
      insert into duty_slots(id,desk_id,day_of_week,start_time,end_time,effective_from) values ('${id(200+n)}','${id(100+n)}',1,'09:00','11:00','2000-01-01');
      insert into roster_activity_audit(event_type,duty_slot_id,actor_profile_id) values ('TEST','${id(200+n)}','${id(4)}');
      insert into duty_assignments(slot_id,profile_id,duty_date) values ('${id(200+n)}','${id(4)}','2000-01-03');`);
  }
  await db.exec(`insert into roster_activity_audit(event_type,actor_profile_id) values ('TEST_ACCOUNT','${id(4)}');`);
  await db.exec("insert into statutory_holidays(holiday_date,description) values ('2001-01-01','Local existing holiday');");
  for (const actor of actors) {
    await db.query('insert into desk_follows(profile_id,desk_id) values ($1,$2)',[actor.id,id(101)]);
    await db.query('insert into user_preferences(profile_id) values ($1)',[actor.id]);
    await db.query("insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date,count_n) values ($1,$2,'REGISTER','NEXT_N','2000-01-03',1)",[actor.id,id(201)]);
    await db.query("insert into duty_statistics(profile_id,slot_id,duty_date,desk_name_snapshot,desk_code_snapshot,start_time_snapshot,end_time_snapshot) values ($1,$2,'1999-12-27','Desk 1','D1','09:00','11:00')",[actor.id,id(201)]);
  }
});
after(async () => { await db?.close(); });

async function as(actor, work, role='authenticated') {
  await db.exec(`begin; set local role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor?.id || '']);
  try { return await work(); } finally { await db.exec('rollback;'); }
}
const denied = (query, code='42501') => assert.rejects(query, error => error.code === code);

for (const actor of actors) test(`database eligibility: ${actor.status} ${actor.role}`, async () => {
  const approved = actor.status === 'Approved';
  await as(actor, async () => {
    assert.equal((await db.query('select is_approved_member() as allowed')).rows[0].allowed, approved);
    assert.equal((await db.query('select * from service_desks')).rows.length, approved ? 3 : 0);
    assert.equal((await db.query('select * from duty_slots')).rows.length, approved ? 3 : 0);
    assert.equal((await db.query('select * from duty_assignments')).rows.length, approved ? 3 : 0);
    for (const table of ['desk_follows','user_preferences','recurring_rules','duty_statistics']) {
      assert.equal((await db.query(`select * from ${table} where profile_id=$1`,[actor.id])).rows.length,approved?1:0);
    }
    assert.equal((await db.query('select * from statutory_holidays')).rows.length,approved?1:0);
    assert.equal((await db.query('select * from get_roster_member_directory_for_current_user()')).rows.length, approved ? actor.role==='Registrar' ? 12 : 3 : 0);
    assert.equal((await db.query('select * from get_incomplete_duty_statistics_for_current_user()')).rows.length, approved ? actor.role==='Registrar' ? 3 : actor.role==='Admin' ? 2 : 0 : 0);
    assert.equal((await db.query('select * from get_roster_activity_audit_for_current_user()')).rows.length, approved ? actor.role==='Registrar' ? 4 : actor.role==='Admin' ? 2 : 0 : 0);
  });
  await as(actor, () => denied(db.query('select * from roster_activity_audit')));
  await as(actor, () => denied(db.query('select event_type from roster_activity_audit')));
  await as(actor, async () => {
    const query = db.query('insert into desk_follows(profile_id,desk_id) values ($1,$2)', [actor.id,id(102)]);
    if (approved) await query; else await denied(query);
  });
  await as(actor, async () => {
    const query = db.query("insert into user_preferences(profile_id) values ($1) on conflict(profile_id) do update set calendar_filters='{}'", [actor.id]);
    if (approved) await query; else await denied(query);
  });
  await as(actor, async () => {
    const query = db.query("insert into statutory_holidays(holiday_date,description) values ('2000-01-01','Local test')");
    if (approved && actor.role==='Registrar') await query; else await denied(query);
  });
  await as(actor, async () => {
    const query = db.query("select update_my_profile('123','NONE',null,4)");
    if (approved) await query; else await denied(query);
  });
  if (!approved) {
    await as(actor, () => denied(db.query("select save_duty_statistic_for_member(null,$1,$2,'2000-01-03','{}')", [actor.id,id(201)])));
    await as(actor, () => denied(db.query('select delete_duty_statistic_for_member($1)', [id(999)])));
  }
  await as(actor, async () => {
    const query = db.query("select update_pending_profile('Updated','555','9000',true)");
    if (actor.status==='Pending') {
      await query;
      const profile = (await db.query('select * from profiles where id=$1', [actor.id])).rows[0];
      assert.equal(profile.full_name,'Updated'); assert.equal(profile.warrant_number,'JP-9000');
      assert.equal(profile.status,'Pending'); assert.equal(profile.role,actor.role);
      assert.equal(profile.desk_admin_reminder_frequency,'NONE');
      assert.equal((await db.query("update profiles set status='Approved',role='Registrar' where id=$1 returning id", [actor.id])).rows.length,0);
    } else await denied(query);
  });
});

test('Approved statistics workflows retain self and assigned-desk scope', async () => {
  for (const [actorIndex,slot,allowed] of [[3,201,true],[4,201,true],[4,203,true],[4,202,false],[5,202,true],[0,201,false]]) {
    await as(actors[actorIndex], async () => {
      const query=db.query("select save_duty_statistic_for_member(null,$1,$2,'2000-01-03','{\"noOfClients\":6}') as id",[id(4),id(slot)]);
      if (!allowed) return denied(query,actorIndex===0?'42501':'P0001');
      const statistic=(await query).rows[0].id;
      assert.equal((await db.query('select no_of_clients from duty_statistics where id=$1',[statistic])).rows[0].no_of_clients,6);
      await db.query('select delete_duty_statistic_for_member($1)',[statistic]);
    });
  }
});

test('current database status and desk assignments override retained session claims', async () => {
  await db.exec(`update profiles set status='Archived' where id='${id(5)}';`);
  try { await as(actors[4], async () => {
    assert.equal((await db.query('select * from get_roster_activity_audit_for_current_user()')).rows.length,0);
    assert.equal((await db.query('select * from service_desks')).rows.length,0);
  }); } finally { await db.exec(`update profiles set status='Approved' where id='${id(5)}';`); }
  await db.exec(`update service_desks set primary_admin_id='${id(2)}' where id='${id(101)}';`);
  try { await as(actors[4], async () => {
    const audit=(await db.query('select * from get_roster_activity_audit_for_current_user()')).rows;
    assert.deepEqual(audit.map(row=>row.duty_slot_id),[id(203)]);
  }); } finally { await db.exec(`update service_desks set primary_admin_id='${id(5)}' where id='${id(101)}';`); }
});

test('profile approval does not change Auth confirmation state or token', async () => {
  await as(actors[5], async () => {
    await db.query("update profiles set status='Approved' where id=$1",[id(1)]);
    await db.exec('reset role;');
    const row=(await db.query('select email_confirmed_at,confirmation_token from auth.users where id=$1',[id(1)])).rows[0];
    assert.equal(row.email_confirmed_at,null); assert.equal(row.confirmation_token,'local-token');
  });
});

test('service role table access preserved and anonymous new APIs denied', async () => {
  await as(null, async () => {
    assert.equal((await db.query('select * from service_desks')).rows.length,3);
    assert.equal((await db.query('select * from roster_activity_audit')).rows.length,4);
    await db.query('select * from duty_assignment_notifications');
    await db.query('select * from duty_statistics_reminders');
  },'service_role');
  await as(null,()=>denied(db.query('select is_approved_member()')),'anon');
  await as(null,()=>denied(db.query("select update_pending_profile('Name','123','9000',false)")),'anon');
});

test('migration refuses changed baseline and rolls back without partial installation', async () => {
  const pg=await baseline();
  try {
    await pg.exec('create or replace function is_approved_registrar() returns boolean language sql as $$ select true $$;');
    await assert.rejects(pg.exec(migration), /Stage 2A preflight: function missing or changed/);
    await pg.exec('rollback;');
    assert.equal((await pg.query("select to_regprocedure('public.is_approved_member()') as helper")).rows[0].helper,null);
  } finally { await pg.close(); }
});

test('Pending profile whitelist rejects invalid data and cannot target someone else', async () => {
  for (const values of [[null,'123','9000',false],['Name','123','',false],['Name','123','no digits',false]]) {
    await as(actors[0],()=>assert.rejects(db.query('select update_pending_profile($1,$2,$3,$4)',values)));
  }
  await as(actors[0],async () => {
    assert.equal((await db.query('select * from profiles where id=$1',[id(2)])).rows.length,0);
    assert.equal((await db.query("update profiles set role='Registrar',status='Approved' where id=$1 returning id",[id(2)])).rows.length,0);
    await db.query("select update_pending_profile('Only own profile','123','9000',false)");
    await db.exec('reset role;');
    assert.equal((await db.query('select full_name from profiles where id=$1',[id(2)])).rows[0].full_name,'Pending Admin');
    assert.equal((await db.query('select email from profiles where id=$1',[id(1)])).rows[0].email,`${id(1)}@example.invalid`);
  });
});

test('actor checks do not introduce an Archived-subject restriction on existing statistics', async () => {
  const statistic=(await db.query('select id from duty_statistics where profile_id=$1',[id(10)])).rows[0].id;
  await as(actors[4],async () => {
    await db.query("select save_duty_statistic_for_member($1,$2,$3,'1999-12-27','{\"noOfClients\":8}')",[statistic,id(10),id(201)]);
    assert.equal((await db.query('select no_of_clients from duty_statistics where id=$1',[statistic])).rows[0].no_of_clients,8);
  });
});

test('all operational tables have restrictive actor policies and audit bypass stays closed', async () => {
  const policies=(await db.query("select tablename from pg_policies where schemaname='public' and policyname='stage2a_approved_actor' and permissive='RESTRICTIVE' and cmd='ALL'")).rows;
  assert.equal(policies.length,17);
  assert.ok(!policies.some(p=>p.tablename==='profiles'));
  assert.equal((await db.query("select * from pg_policies where policyname='roster_activity_audit_admin_read'")).rows.length,0);
  await as(actors[5],()=>denied(db.query("select is_duty_slot_holiday($1,'2000-01-03')",[id(201)])));
  // Even an accidental future table grant must not resurrect the old broad policy.
  await db.exec('grant select on roster_activity_audit to authenticated;');
  try { await as(actors[4], async () => assert.equal((await db.query('select * from roster_activity_audit')).rows.length,0)); }
  finally { await db.exec('revoke select on roster_activity_audit from authenticated;'); }
  await db.exec(readFileSync(new URL('../supabase/verification/stage2a_eligibility_verification.sql',import.meta.url),'utf8'));
});
