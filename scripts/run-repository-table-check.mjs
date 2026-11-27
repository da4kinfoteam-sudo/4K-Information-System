import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createResourcesFixture} from './resources-sql-fixture.mjs';
import {repositoryListArgs, repositoryChoiceChecked, toggleRepositoryChoice, REPOSITORY_DEFAULT_SORT} from '../lib/repositoryTable.ts';

const {db} = await createResourcesFixture();
let passed = 0;
const check = async (name, run) => {await run(); passed++; console.log('PASS ' + name);};
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const include = (...values) => ({mode: 'include', values});
try {
    const root = (await one('select resource_start_session($1,$2) value', ['root', 'fixture-password'])).value.token;
    const user = (await one('select resource_start_session($1,$2) value', ['region1', 'fixture-password'])).value.token;
    const read = async (args = {}, token = root) => (await one("select resource_read($1,'entries',$2) value", [token, args])).value;
    const parent = randomUUID(), otherParent = randomUUID();
    await db.query("insert into repository_entries(id,kind,subject,state,created_by_name) values($1,'Folder','Parent A','Published','Fixture'),($2,'Folder','Parent B','Published','Fixture')", [parent, otherParent]);
    await db.query(`insert into repository_entries(kind,subject,state,reporting_year,created_by_name,parent_id,updated_at)
      select 'Folder','Document '||lpad(n::text,3,'0'),'Published',2020+n%6,'Fixture',case when n=62 then $1::uuid else null end,'2026-01-01'::timestamptz+n*interval '1 day' from generate_series(1,62) n`, [parent]);
    await db.query("insert into repository_entries(kind,subject,state,created_by_name,parent_id) values('Folder','Document Child Elsewhere','Published','Fixture',$1)", [otherParent]);
    const requirement = (await db.query(`insert into repository_entries(kind,subject,state,created_by_name,required_submission,reporting_year,due_at)
      values('Folder','Required fixture','Published','Fixture',true,2025,'2025-01-01') returning id`)).rows[0].id;
    await db.query("insert into repository_assignments(entry_id,operating_unit) values($1,'RPMO 1'),($1,'RPMO 2')", [requirement]);
    await db.query("insert into repository_entries(kind,subject,state,created_by_name,audience_ous) values('Folder','Secret choice','Published','Fixture',array['RPMO 2'])");
    await db.query("update repository_entries set published_at=created_at where state='Published'");
    await check('filtering and sorting precede pagination with deterministic ordering', async () => {
        const result = await read({search: 'Document ', page_size: 10, sort_key: 'subject', sort_direction: 'ascending'});
        assert.equal(result.total, 63); assert.equal(result.rows.length, 10); assert.equal(result.rows[0].subject, 'Document 001');
        const filtered = await read({filters: {subject: include('Document 062')}, page_size: 10});
        assert.equal(filtered.total, 1); assert.equal(filtered.rows[0].subject, 'Document 062');
        const second = await read({search: 'Document ', page_size: 10, page: 2, sort_key: 'subject', sort_direction: 'ascending'});
        assert.equal(second.rows[0].subject, 'Document 011');
        const tie = await read({sort_key: 'state', sort_direction: 'ascending', page_size: 100});
        assert.deepEqual(tie.rows.map(row => row.id), [...tie.rows.map(row => row.id)].sort());
    });
    await check('typed numeric/date sorts use NULLS LAST and counts match filters', async () => {
        const years = await read({sort_key: 'year', sort_direction: 'descending', page_size: 100});
        assert.equal(years.rows[0].reporting_year, 2025); assert.equal(years.rows.at(-1).reporting_year, null);
        const due = await read({sort_key: 'due', sort_direction: 'ascending', page_size: 100});
        assert.equal(due.rows[0].id, requirement); assert.equal(due.rows.at(-1).due_at, null);
        const combined = await read({filters: {year: include('2025'), subject: {mode: 'exclude', values: ['Required fixture']}}, page_size: 100});
        assert(combined.total > 1); assert(combined.rows.every(row => row.reporting_year === 2025 && row.id !== requirement));
        assert.equal((await read({filters: {year: include()}})).total, 0);
        assert.equal((await read({filters: {assigned: include('2')}})).rows[0].id, requirement);
    });
    await check('authorized facet choices cover the full result set and remain bounded/searchable', async () => {
        const facet = await read({facet_key: 'subject', page_size: 10000, sort_key: 'subject'});
        assert.equal(facet.rows.length, 50); assert(facet.total > 50);
        const second = await read({facet_key: 'subject', page: 2, page_size: 50});
        assert(second.rows.length > 0); assert(!second.rows.some(row => facet.rows.some(first => first.value === row.value)));
        assert.equal((await read({facet_key: 'subject', facet_search: 'Document 062'})).rows[0].value, 'Document 062');
        const ownFacet = await read({facet_key: 'subject', filters: {subject: include('Document 001'), year: include('2025')}});
        assert(ownFacet.total > 1); assert(ownFacet.rows.every(row => row.value === 'Required fixture' || Number(row.value.slice(-3)) % 6 === 5));
        assert(!(await read({facet_key: 'subject', facet_search: 'Secret choice'}, user)).rows.length);
        assert.equal((await read({search: 'Secret choice'}, user)).total, 0);
    });
    await check('embedded folder scope is retained through search, filters, facets and counts', async () => {
        const args = repositoryListArgs({}, 'Document', REPOSITORY_DEFAULT_SORT, parent);
        assert.equal(args.parent_id, parent);
        const scoped = await read(args); assert.equal(scoped.total, 1); assert.equal(scoped.rows[0].subject, 'Document 062');
        const facet = await read({...args, facet_key: 'subject'}); assert.equal(facet.total, 1);
        assert.equal((await read({...args, filters: {subject: include('Document Child Elsewhere')}})).total, 0);
        assert(!('parent_id' in repositoryListArgs({}, 'Document', REPOSITORY_DEFAULT_SORT)));
        assert.equal(repositoryListArgs({}, '', REPOSITORY_DEFAULT_SORT).parent_id, null);
        assert(!('parent_id' in repositoryListArgs({kind: include('Required Folder')}, '', REPOSITORY_DEFAULT_SORT)));
        assert(!('parent_id' in repositoryListArgs({kind: {mode:'exclude',values:['Folder','File']}}, '', REPOSITORY_DEFAULT_SORT)));
        assert(!('parent_id' in repositoryListArgs({own: {mode:'exclude',values:['Not Assigned']}}, '', REPOSITORY_DEFAULT_SORT)));
        assert(!('parent_id' in repositoryListArgs({due: {mode:'exclude',values:['No Deadline']}}, '', REPOSITORY_DEFAULT_SORT)));
        assert.equal(repositoryListArgs({kind: {mode:'exclude',values:['Folder','File']}}, '', REPOSITORY_DEFAULT_SORT,parent).parent_id,parent);
    });
    await check('root discovery facets include authorized nested requirements without widening embedded folders', async () => {
        const child=(await db.query("insert into repository_entries(kind,subject,parent_id,state,required_submission,reporting_year,due_at,created_by_name) values('Folder','Nested Required Draft',$1,'Draft',true,2027,'2090-01-01','Fixture') returning id",[parent])).rows[0].id;
        await db.query("insert into repository_assignments(entry_id,operating_unit) values($1,'NPMO')",[child]);
        const args={parent_id:null,filters:{state:include('Draft')}};
        assert.equal((await read(args)).total,0);
        assert((await read({...args,facet_key:'kind'})).rows.some(row=>row.value==='Required Folder'));
        assert((await read({...args,facet_key:'due'})).rows.some(row=>row.value==='Upcoming'));
        assert((await read({...args,facet_key:'own'})).rows.some(row=>row.value==='Pending My Submission'));
        assert(!(await read({...args,facet_key:'kind'},user)).rows.length);
        assert.equal((await read({...args,parent_id:otherParent,facet_key:'kind'})).total,0);
        const scope=repositoryListArgs({...args.filters,kind:include('Required Folder')},'',REPOSITORY_DEFAULT_SORT);
        assert.equal((await read(scope)).rows[0].id,child);
        await db.query('delete from repository_assignments where entry_id=$1',[child]);
        await db.query('delete from repository_entries where id=$1',[child]);
    });
    await check('deadline, required and own-pending meanings remain intact including legacy args', async () => {
        assert.equal((await read({filters: {due: include('Overdue')}})).rows[0].id, requirement);
        assert.equal((await read({filters: {kind: include('Required Folder')}})).rows[0].id, requirement);
        assert.equal((await read({filters: {own: include('Pending My Submission')}}, user)).rows[0].id, requirement);
        assert.equal((await read({required_only: true, overdue_only: true, pending_only: true}, user)).rows[0].id, requirement);
        await db.query("update repository_assignments set waived=true where entry_id=$1 and operating_unit='RPMO 1'", [requirement]);
        assert.equal((await read({filters: {own: include('Pending My Submission')}}, user)).total, 0);
        assert.equal((await read({pending_only: true}, user)).total, 0);
    });
    await check('large all-selection uses exclusions rather than dropping unseen facet choices', async () => {
        let filter = toggleRepositoryChoice(undefined, 'Document 001', false);
        assert.deepEqual(filter, {mode: 'exclude', values: ['Document 001']});
        assert(repositoryChoiceChecked(filter, 'Document 062')); assert(!repositoryChoiceChecked(filter, 'Document 001'));
        assert.equal((await read({search: 'Document ', filters: {subject: filter}})).total, 62);
        filter = toggleRepositoryChoice(filter, 'Document 001', true); assert.equal(filter, undefined);
        assert.deepEqual(toggleRepositoryChoice(include(), 'Document 062', true), include('Document 062'));
    });
    await check('unknown sort/filter/facet input is rejected without SQL interpolation', async () => {
        for (const args of [{sort_key: 'password'}, {sort_direction: 'drop table'}, {facet_key: 'audience_ous'}, {filters: {unknown: include('x')}}, {filters: {subject: {mode: 'bogus', values: []}}}, {filters: {subject: include(...Array(101).fill('x'))}}]) {
            await assert.rejects(() => read(args), /Unsupported|Invalid|at most/);
        }
        await assert.rejects(() => read({}, '0'.repeat(64)), /expired/);
        const grants = await one("select has_function_privilege('anon','resource_repository_entries(jsonb,jsonb)','EXECUTE') a,has_function_privilege('authenticated','resource_repository_entries(jsonb,jsonb)','EXECUTE') b,has_function_privilege('service_role','resource_read(text,text,jsonb)','EXECUTE') c");
        assert.deepEqual(grants, {a: false, b: false, c: true});
    });
    await check('corrective migration preserves existing rows, assignments, grants and other read branches', async () => {
        const snapshot = () => one("select (select md5(jsonb_agg(to_jsonb(r) order by id)::text) from repository_entries r) entries,(select md5(jsonb_agg(to_jsonb(r) order by id)::text) from repository_assignments r) assignments,(select md5(jsonb_agg(to_jsonb(r) order by id)::text) from roles_config r) roles,(select proacl::text from pg_proc where oid='resource_read(text,text,jsonb)'::regprocedure) grants");
        const before = await snapshot();
        await db.exec(await readFile('supabase/migrations/202611230001_repository_table_reads.sql', 'utf8'));
        assert.deepEqual(await snapshot(), before);
        assert.equal((await one("select resource_read($1,'entry',$2) value", [root, {id: parent}])).value.id, parent);
        assert.equal((await one("select resource_read($1,'tickets','{}') value", [root])).value.total, 0);
        assert.equal((await one("select resource_read($1,'reportorial',$2) value", [root, {reporting_year: 2025}])).value.periods[0].source, 'Manual');
    });
    console.log(`${passed} repository table checks passed using disposable SQL; no hosted services used.`);
} finally {await db.close();}
