import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [{
        name: 'repeating-offline-client', enforce: 'pre',
        resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0repeating-client'; },
        load(id) { if (id === '\0repeating-client') return `export const supabase = { from(table) {
            const filters = []; let action = 'read', payload;
            const query = { select() { return query; }, eq(key, value) { filters.push([key,value]); return query; }, maybeSingle() { return query; },
                insert(value) { action = 'insert'; payload = value; return query; },
                then(resolve, reject) { const f = globalThis.repeatFixture; f.calls.push({ table, action, filters, payload });
                    if (f.throw) return Promise.reject(new Error('Synthetic transport failure')).then(resolve,reject);
                    return Promise.resolve(f.result).then(resolve,reject);
                }
            }; return query;
        } };`; },
    }] });
try {
    const helpers = await server.ssrLoadModule('/lib/activityRepeatingEntries.ts');
    const { persistRepeatingActivity } = await server.ssrLoadModule('/lib/activityRepeatingPersistence.ts');
    const { emptyRepeatingActivityEntry: empty, hasRepeatingEntryDraft: dirty, validateRepeatingActivityEntry: validate,
        normalizeRepeatingActivityEntry: normalize, canChooseActivityOu: canChoose, buildRepeatingActivityPayload: build } = helpers;
    const entry = { ...empty(), date: '2027-01-03', participantsMale: 0, participantsFemale: 4,
        participating_ipo_ids: [11], participatingIpos: ['Old label'] };
    assert.notEqual(empty().key, empty().key);
    assert.equal(dirty(empty()), false);
    assert.equal(dirty(entry), true);
    assert.equal(dirty({ ...empty(), participantsMale: '' }), true);
    assert.equal(validate(entry), null);
    for (const date of ['', '2027-02-30', 'not-a-date', '1899-01-01']) assert.ok(validate({ ...entry, date }));
    assert.ok(validate({ ...entry, isMultiDay: true, endDate: '' }));
    assert.ok(validate({ ...entry, isMultiDay: true, endDate: '2027-01-02' }));
    assert.equal(validate({ ...entry, isMultiDay: true, endDate: entry.date }), null);
    for (const value of [-1, 0.5, NaN, Infinity, '', Number.MAX_SAFE_INTEGER + 1]) assert.ok(validate({ ...entry, participantsMale: value }));
    assert.ok(validate({ ...entry, participantsMale: Number.MAX_SAFE_INTEGER }));
    assert.equal(normalize({ ...entry, endDate: '2030-01-01' }).endDate, entry.date);
    assert.equal(canChoose('Super Admin', true, 'Own OU'), true);
    assert.equal(canChoose('Administrator', true, 'All'), true);
    assert.equal(canChoose('Management', true, 'All'), true);
    assert.equal(canChoose('Management', true, 'Own OU'), false);
    assert.equal(canChoose('Guest', false, 'All'), false);
    const ipos = [{ id: 11, name: 'Current IPO name', region: 'Region I' }, { id: 22, name: 'Other IPO', region: 'Region II' }];
    const shared = { id: 0, type: 'Activity', name: 'Subproject Monitoring', activity_title: ' Specific title ', component: 'Program Management',
        operatingUnit: 'RPMO 1', fundingYear: 2027, fundType: 'Continuing', tier: 'Tier 2', fundSourceUid: 'FS-2', fundSource: 'Corn',
        location: 'Location', date: '', actualDate: '', newTargetDate: '', actualEndDate: '', status: 'Proposed',
        participating_ipo_ids: [], participatingIpos: [], expenses: [
            { id: 1, budgetItemGroupId: 'group', amount: 50, obligationMonth: '2027-01-01', disbursementMonth: '2027-02-01' },
            { id: 2, budgetItemGroupId: 'group', amount: 75, obligationMonth: '2027-03-01', disbursementMonth: '2027-04-01' },
        ] };
    const original = JSON.stringify({ shared, entry });
    const options = { userName: 'Fixture', requiresApprover: true, reservedExpenseIds: new Set(['1','2']) };
    const first = build(shared, entry, ipos, options);
    const second = build({ ...shared, type: 'Training', name: 'Specific Training' }, { ...entry, participating_ipo_ids: [22], participatingIpos: ['Other IPO'] }, ipos, options);
    assert.equal(JSON.stringify({ shared, entry }), original);
    assert.equal(first.id, undefined); assert.equal(first.key, undefined); assert.equal(first.isMultiDay, undefined);
    assert.match(first.uid, /^ACT-\d{4}-[A-F0-9]{32}$/); assert.match(second.uid, /^TRN-/); assert.notEqual(first.uid,second.uid);
    assert.equal(second.type, 'Training'); assert.equal(second.name, 'Specific Training'); assert.equal(first.activity_title, 'Specific title');
    assert.deepEqual(first.participating_ipo_ids,[11]); assert.deepEqual(first.participatingIpos,['Current IPO name','Old label']);
    assert.deepEqual(second.participating_ipo_ids,[22]); assert.equal(first.date,entry.date); assert.equal(first.endDate,entry.date);
    assert.equal(first.workflow_status,'PENDING'); assert.equal(build(shared,entry,ipos,{...options,requiresApprover:false}).workflow_status,'APPROVED');
    for (const field of ['fundingYear','fundType','tier','fundSourceUid','fundSource','operatingUnit']) assert.equal(first[field], shared[field]);
    assert.equal(first.actualDate,null); assert.equal(first.actualEndDate,null);
    assert.equal(new Set([...first.expenses,...second.expenses].map(row=>row.id)).size,4);
    assert.equal(first.expenses[0].budgetItemGroupId,first.expenses[1].budgetItemGroupId);
    assert.notEqual(first.expenses[0].budgetItemGroupId,second.expenses[0].budgetItemGroupId);
    assert.deepEqual(first.expenses.map(row=>[row.obligationMonth,row.disbursementMonth,row.amount]),shared.expenses.map(row=>[row.obligationMonth,row.disbursementMonth,row.amount]));
    const attempt = { payload:first, uncertain:false };
    globalThis.repeatFixture={calls:[],result:{data:[{...first,id:91}],error:null}};
    assert.equal((await persistRepeatingActivity(attempt)).id,91);
    await persistRepeatingActivity(attempt); assert.equal(globalThis.repeatFixture.calls.length,1);
    const rejected={payload:second,uncertain:false};
    globalThis.repeatFixture={calls:[],result:{data:null,error:{code:'23514',message:'Synthetic constraint rejection'}}};
    await assert.rejects(()=>persistRepeatingActivity(rejected),/constraint/); assert.equal(rejected.uncertain,false);
    const uncertain={payload:first,uncertain:false};
    globalThis.repeatFixture={calls:[],throw:true}; await assert.rejects(()=>persistRepeatingActivity(uncertain),/transport/); assert.equal(uncertain.uncertain,true);
    globalThis.repeatFixture={calls:[],result:{data:null,error:null}};
    await assert.rejects(()=>persistRepeatingActivity(uncertain),/not confirmed/);
    assert.equal(globalThis.repeatFixture.calls[0].action,'read'); assert.deepEqual(globalThis.repeatFixture.calls[0].filters,[['uid',first.uid]]);
    globalThis.repeatFixture={calls:[],result:{data:{...first,id:92},error:null}};
    assert.equal((await persistRepeatingActivity(uncertain)).id,92); assert.equal(globalThis.repeatFixture.calls[0].action,'read');
    const noRow={payload:first,uncertain:false}; globalThis.repeatFixture={calls:[],result:{data:[],error:null}};
    await assert.rejects(()=>persistRepeatingActivity(noRow),/No confirmed/); assert.equal(noRow.uncertain,true);
    console.log('PASS: typed repeating drafts, validation, OU capability, shared funding, independent identity/IPO/schedule dates, approval, immutable inputs, confirmed writes and read-only uncertain-save recovery. Synthetic clients only.');
} finally { await server.close(); }
