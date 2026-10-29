import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [], entries: [] } });
try {
    const {
        getActivityIpoSelection, activityIpoLinksFromSelection, reconcileActivityIpoLinks,
        activityIncludesIpo, resolveActivityIpos, buildActivityDetailsPayload,
    } = await vite.ssrLoadModule('/lib/activityIpoLinks.ts');
    const { buildActivityClonePayload } = await vite.ssrLoadModule('/lib/recordCloning.ts');
    const ipos = [
        { id: 11, name: 'Original IPO', region: 'Region I' },
        { id: 22, name: 'Replacement IPO', region: 'Region II' },
        { id: 33, name: 'Duplicate name', region: 'Region I' },
        { id: 44, name: 'Duplicate name', region: 'Region II' },
    ];
    const original = {
        id: 101, uid: 'ACT-TFR-101', type: 'Activity', name: 'Subproject Monitoring', status: 'Completed',
        participating_ipo_ids: [11], participatingIpos: ['Original IPO'],
        budgetItemTransferId: 'transfer-1', isTransferTargetExcluded: true,
        actualDate: '2026-08-03', actualParticipantsMale: 12,
        expenses: [{ id: 1, amount: 500, obligations: [{ id: 1, amount: 100, date: '2026-08-01' }], disbursements: [{ id: 2, amount: 50, date: '2026-08-01' }] }],
        history: [],
    };
    const snapshot = structuredClone(original);
    const clone = buildActivityClonePayload(original, { createdAt: '2026-10-12T00:00:00Z', encodedBy: 'Fixture', requiresApprover: false });
    assert.deepEqual(clone.participating_ipo_ids, [11]);
    const replacement = reconcileActivityIpoLinks({ participating_ipo_ids: [22], participatingIpos: ['Replacement IPO'] }, ipos);
    assert.deepEqual(replacement, { participating_ipo_ids: [22], participatingIpos: ['Replacement IPO'] });
    assert.equal(activityIncludesIpo(replacement, 11, 'Original IPO'), false);
    assert.equal(activityIncludesIpo(replacement, 22, 'Replacement IPO'), true);
    assert.deepEqual(original, snapshot);
    assert.deepEqual(reconcileActivityIpoLinks({ participating_ipo_ids: [], participatingIpos: [] }, ipos), { participating_ipo_ids: [], participatingIpos: [] });

    const conflicting = { participating_ipo_ids: [22], participatingIpos: ['Original IPO'] };
    assert.deepEqual(resolveActivityIpos(conflicting, ipos).map(ipo => ipo.id), [22]);
    assert.equal(activityIncludesIpo(conflicting, 11, 'Original IPO'), false);
    const unmatched = getActivityIpoSelection({ participating_ipo_ids: [11], participatingIpos: ['Original IPO', 'Replacement IPO'] }, ipos);
    assert.equal(unmatched.find(row => row.name === 'Replacement IPO').ipoId, null, 'Unmatched legacy label remains explicit without inventing a link');
    assert.equal(unmatched.length, 2);
    assert.deepEqual(reconcileActivityIpoLinks({ participatingIpos: ['Original IPO'] }, ipos), { participating_ipo_ids: [11], participatingIpos: ['Original IPO'] });
    assert.equal(getActivityIpoSelection({ participatingIpos: ['Duplicate name'] }, ipos)[0].ipoId, null);
    assert.deepEqual(reconcileActivityIpoLinks({ participating_ipo_ids: [33, 44], participatingIpos: ['Duplicate name', 'Duplicate name'] }, ipos).participating_ipo_ids, [33, 44]);
    const unavailable = { participating_ipo_ids: [99], participatingIpos: ['Unavailable IPO'] };
    assert.deepEqual(reconcileActivityIpoLinks(unavailable, []), unavailable);
    assert.deepEqual(reconcileActivityIpoLinks({ participatingIpos: ['Unresolved legacy'] }, []), { participating_ipo_ids: [], participatingIpos: ['Unresolved legacy'] });
    const rows = getActivityIpoSelection({ participating_ipo_ids: [11, 22] }, ipos);
    assert.deepEqual(activityIpoLinksFromSelection(rows.filter(row => row.ipoId !== 11)), replacement);
    assert.deepEqual(reconcileActivityIpoLinks({ participating_ipo_ids: [11, 11], participatingIpos: ['Original IPO'] }, ipos).participating_ipo_ids, [11]);

    const payload = buildActivityDetailsPayload({ ...original, ...replacement });
    assert.deepEqual(payload.participating_ipo_ids, [22]);
    for (const field of ['expenses', 'actualDate', 'actualParticipantsMale', 'physical_accomplishment_submitted_at', 'budgetItemTransferId', 'isTransferTargetExcluded']) {
        assert.equal(Object.hasOwn(payload, field), false, `Details must not write ${field}`);
    }
    const form = await readFile(new URL('../components/ActivityEdit.tsx', import.meta.url), 'utf8');
    const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
    assert.match(form, /readActivityAccomplishments\(\[activity.id\], currentUser\)/);
    assert.match(form, /saveActivityAccomplishment\(\{/);
    assert.doesNotMatch(form, /syncActivityObligations\(/);
    assert.match(form, /update\(sanitizedPayload\)\.eq\('id', activity!\.id\)\.select\(\)\.single\(\)/);
    assert.match(form, /buildRepeatingActivityPayload\(shared, entry, ipos/);
    assert.match(app, /onUpdateActivity=\{handleActivitySaved\}/);
    assert.match(app, /activitiesSync\.upsertLocalData\(\[updated\]\)/);
    console.log('PASS: Activity IPO identity, replacement/clear, legacy/duplicate/unavailable links, clone safety, details payload isolation, and persisted-row wiring.');
} finally {
    await vite.close();
}
