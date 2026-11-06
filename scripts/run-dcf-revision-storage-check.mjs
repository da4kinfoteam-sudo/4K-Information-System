import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDcfRevisionFixture, installDcfRevision, domains, root, rpc } from './helpers/dcf-revision-fixture.mjs';

// Representative disposable payload measurements, not production egress or
// storage forecasts. No remote URL, credential file, or live data is used.
const db = await createDcfRevisionFixture({ install: false });
const identity = type => ({ p_actor_id: 1, p_actor_password: 'fixture-password', p_entity_type: type, p_parent_id: 1 });
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
try {
    await installDcfRevision(db, { mutations: true });
    await db.exec(await readFile(path.join(root, 'supabase/migrations/202611030003_dcf_revision_restore.sql'), 'utf8'));
    const measurements = [];
    for (const d of domains) {
        let state = await rpc(db, 'read_dcf_state', identity(d.table));
        for (let n = 0; n < 55; n++) {
            state = await rpc(db, 'commit_dcf_change', { ...identity(d.table), p_base: state,
                p_changes: { [d.label]: `Representative revision ${n}` }, p_financial: [],
                p_source: 'disposable-storage-measurement', p_reason: 'Disposable fixture only', p_request_key: crypto.randomUUID() });
        }
        const list = await rpc(db, 'list_dcf_revisions', { ...identity(d.table), p_limit: 10 });
        assert.equal(list.rows.length, 10);
        assert.equal(list.total, 56);
        assert.ok(list.rows.every(row => !('snapshot' in row) && !('record' in row) && !('financial' in row)));
        const next = await rpc(db, 'list_dcf_revisions', { ...identity(d.table), p_limit: 10, p_before_revision: list.nextCursor });
        assert.ok(next.rows.every(row => Number(row.id) < Number(list.nextCursor)));
        assert.equal(new Set([...list.rows, ...next.rows].map(row => row.id)).size, 20);
        const saved = await rpc(db, 'read_dcf_revision', { ...identity(d.table), p_revision_id: list.rows[0].id });
        const sizes = (await db.query(`select count(*)::int revisions,
            sum(octet_length(snapshot::text))::bigint uncompressed_snapshot_bytes,
            sum(pg_column_size(snapshot))::bigint stored_snapshot_bytes
            from dcf_record_revisions where entity_type=$1 and parent_id=1`, [d.table])).rows[0];
        measurements.push({ module: d.table, metadataPage10Bytes: bytes(list), oneVersionResponseBytes: bytes(saved), ...sizes });
    }
    // Prove metadata and immutable-version reads do not construct live ledgers.
    // This intentionally failing helper is installed ONLY in the disposable DB.
    const original = (await db.query(`select pg_get_functiondef('dcf_snapshot(text,bigint,jsonb)'::regprocedure) definition`)).rows[0].definition;
    await db.exec(`create or replace function dcf_snapshot(p_type text,p_id bigint,p_record jsonb default null) returns jsonb
        language plpgsql security definer set search_path=public,pg_temp as $$
        begin raise exception 'Forbidden eager live-ledger snapshot'; end $$;`);
    for (const d of domains) {
        const metadata = await rpc(db, 'list_dcf_revisions', { ...identity(d.table), p_limit: 10 });
        await rpc(db, 'read_dcf_revision', { ...identity(d.table), p_revision_id: metadata.rows[0].id });
    }
    await assert.rejects(() => rpc(db, 'read_dcf_state', identity('activities')), /Forbidden eager/);
    await db.exec(original);
    // Add retained histories of other, no-longer-live parents only for planner
    // scale. These are explicitly synthetic table fixtures, not evidence that
    // 5,000 real mutation workflows or migrations were executed.
    await db.exec(`insert into dcf_record_revisions(entity_type,parent_id,incarnation,version,recorded_at,
        actor_name,operation_id,source,kind,changed_fields,summary,snapshot,snapshot_hash)
        select 'activities',100000+n,gen_random_uuid(),1,clock_timestamp(),'Synthetic query fixture',gen_random_uuid(),
            'disposable-query-scale','create',array[]::text[],'Synthetic unrelated retained history',
            jsonb_build_object('schemaVersion',1,'entityType','activities','parentId',100000+n,'record',null,'financial',jsonb_build_object('obligations','[]'::jsonb,'disbursements','[]'::jsonb,'stages','{}'::jsonb),'related','{}'::jsonb,'physical','{}'::jsonb),'synthetic'
        from generate_series(1,5000) n;`);
    await db.exec('analyze dcf_record_revisions');
    const incarnation = (await db.query(`select incarnation from dcf_revision_heads where entity_type='activities' and parent_id=1`)).rows[0].incarnation;
    const plan = (await db.query(`explain (analyze, buffers, format json)
        select id,version,recorded_at,actor_name,summary from dcf_record_revisions
        where entity_type='activities' and parent_id=1 and incarnation=$1::uuid order by version desc limit 10`, [incarnation])).rows[0]['QUERY PLAN'];
    const indexes = (await db.query(`select indexname,indexdef from pg_indexes where tablename='dcf_record_revisions' order by indexname`)).rows;
    assert.ok(indexes.some(row => /\(incarnation, recorded_at DESC, id DESC\)/.test(row.indexdef)));
    assert.ok(indexes.some(row => /\(entity_type, parent_id, id DESC\)/.test(row.indexdef)));
    const nodes=[];
    const collect=node=>{if(!node||typeof node!=='object')return;if(node['Node Type'])nodes.push(node);for(const child of Object.values(node))if(Array.isArray(child))child.forEach(collect);else if(child&&typeof child==='object')collect(child);};
    collect(plan);
    assert.ok(nodes.some(node=>/incarnation|entity_type.*parent_id/.test(node['Index Cond']||'')), `The paging plan must constrain an index by record/incarnation, not filter the global key: ${JSON.stringify(plan)}`);
    console.log(JSON.stringify({ passed: true, measurements, metadataRequiresLiveSnapshot: false, syntheticRetainedHistories:5000,
        sampleQueryPlan: plan, indexes,
        limitations: ['280 real-adapter disposable versions plus 5,000 synthetic retained-history query rows; not production catalog parity',
            'Snapshot bytes exclude receipts, indexes, backups, WAL and external files',
            'No claim of production latency, storage cost, egress or multi-session ordering'] }, null, 2));
} catch(error) {
    console.error(JSON.stringify({ passed:false, message:error.message, code:error.code, where:error.where }));
    process.exitCode=1;
} finally { await db.close(); }
