import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [], entries: [] },
});
const {
  canEditSubprojectBudgetItem,
  getSubprojectBudgetItemObligations,
  getSubprojectBudgetItemRemovalAction,
  getSubprojectBudgetSaveExpectedStatus,
  removeSubprojectBudgetItemById,
} = await vite.ssrLoadModule('/lib/subprojectBudgetItemLifecycleRules.ts');
const { getBudgetLineTag, isBudgetLineExcludedFromTargets, summarizeBudgetAdjustments } = await vite.ssrLoadModule('/lib/budgetLineAdjustments.ts');
const { resolveSubprojectCompletionRollup } = await vite.ssrLoadModule('/lib/subprojectCompletion.ts');
const { getActiveSubprojectBudget } = await vite.ssrLoadModule('/lib/subprojectItemAdjustments.ts');

try {
const baseItem = {
  id: 101,
  particulars: 'Seedlings',
  numberOfUnits: 100,
  pricePerUnit: 25,
  obligations: [],
  disbursements: [],
};

// Blank and zero legacy amounts remain blank during obligation hydration.
for (const actualObligationAmount of [undefined, null, '', 0, '0', 'invalid', NaN, Infinity]) {
  for (const centralRows of [null, []]) {
    assert.deepEqual(
      getSubprojectBudgetItemObligations({ ...baseItem, actualObligationAmount }, centralRows),
      [],
    );
  }
}

// Real legacy and central actuals remain attached to their stable budget item ID.
for (const amount of [125, -125]) {
  const obligations = getSubprojectBudgetItemObligations({
    ...baseItem,
    actualObligationAmount: amount,
    actualObligationDate: '2026-03-01',
  }, []);
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].amount, amount);
}
const centralRows = [
  { id: 1, itemId: '101', date: '2026-03-01', amount: 125 },
  { id: 2, itemId: '101', date: '2026-03-02', amount: -125 },
  { id: 3, itemId: '102', date: '2026-03-01', amount: 50 },
];
assert.deepEqual(getSubprojectBudgetItemObligations(baseItem, centralRows), centralRows.slice(0, 2));

// Proposed status always permits draft editing and deletion, regardless of linked data or flags.
assert.equal(canEditSubprojectBudgetItem('Proposed', true), true);
assert.equal(getSubprojectBudgetItemRemovalAction('Proposed', true, true), 'delete');
assert.equal(getSubprojectBudgetItemRemovalAction('Proposed', false, true), 'delete');
assert.equal(getSubprojectBudgetItemRemovalAction('Ongoing', true, false), 'cancel');
assert.equal(getSubprojectBudgetItemRemovalAction('Ongoing', false, true), 'cancel');
assert.equal(getSubprojectBudgetItemRemovalAction('Ongoing', false, false), 'delete');
assert.equal(getSubprojectBudgetItemRemovalAction('Completed', true, false), 'block');
assert.equal(getSubprojectBudgetItemRemovalAction('Cancelled', false, true), 'block');
assert.equal(getSubprojectBudgetItemRemovalAction('Completed', false, false), 'delete');
assert.equal(canEditSubprojectBudgetItem('Ongoing', true), false);
assert.equal(canEditSubprojectBudgetItem('Completed', true), false);
assert.equal(canEditSubprojectBudgetItem('Ongoing', false), true);

// Legacy cancellation flags do not affect Proposed targets or delivery rollups.
const legacyCancelledProposedItem = {
  id: 104,
  particulars: 'Legacy cancelled item',
  pricePerUnit: 50,
  numberOfUnits: 2,
  isCancelled: true,
  actualObligationAmount: 100,
};
assert.equal(getBudgetLineTag(legacyCancelledProposedItem, 'Proposed'), null);
assert.equal(isBudgetLineExcludedFromTargets(legacyCancelledProposedItem, 'Proposed'), false);
assert.equal(getActiveSubprojectBudget([legacyCancelledProposedItem], 'Proposed'), 100);
assert.equal(getBudgetLineTag(legacyCancelledProposedItem, 'Ongoing'), 'Cancelled');
assert.equal(isBudgetLineExcludedFromTargets(legacyCancelledProposedItem, 'Ongoing'), true);
assert.equal(getActiveSubprojectBudget([legacyCancelledProposedItem], 'Ongoing'), 0);
assert.equal(resolveSubprojectCompletionRollup([legacyCancelledProposedItem], 'Proposed').activeCount, 1);
assert.equal(resolveSubprojectCompletionRollup([legacyCancelledProposedItem], 'Ongoing').activeCount, 0);
assert.equal(summarizeBudgetAdjustments([legacyCancelledProposedItem], 'Proposed').cancelledAmount, 0);
assert.equal(summarizeBudgetAdjustments([legacyCancelledProposedItem], 'Proposed').activeTargetBudget, 100);
assert.equal(summarizeBudgetAdjustments([legacyCancelledProposedItem], 'Ongoing').cancelledAmount, 100);

// Proposed budget saves are guarded by the status read at write time.
assert.equal(getSubprojectBudgetSaveExpectedStatus('Proposed', true, false), 'Proposed');
assert.equal(getSubprojectBudgetSaveExpectedStatus('Ongoing', true, true), 'Ongoing');
assert.equal(getSubprojectBudgetSaveExpectedStatus('Ongoing', false, false), null);
assert.equal(getSubprojectBudgetSaveExpectedStatus('Completed', true, false), null);

// Removing any row by stable ID updates counts and current target totals immediately.
const budgetItems = [
  { id: 1, pricePerUnit: 2, numberOfUnits: 3 },
  { id: 2, pricePerUnit: 4, numberOfUnits: 5 },
  { id: 3, pricePerUnit: 1, numberOfUnits: 7 },
];
assert.equal(getActiveSubprojectBudget(budgetItems), 33);
for (const [itemId, expectedTotal] of [[1, 27], [2, 13], [3, 26]]) {
  const remaining = removeSubprojectBudgetItemById(budgetItems, itemId);
  assert.equal(remaining.length, 2);
  assert.equal(remaining.some(item => item.id === itemId), false);
  assert.equal(getActiveSubprojectBudget(remaining), expectedTotal);
}
const afterMultipleDeletes = removeSubprojectBudgetItemById(
  removeSubprojectBudgetItemById(budgetItems, 1),
  3,
);
assert.deepEqual(afterMultipleDeletes.map(item => item.id), [2]);
assert.equal(getActiveSubprojectBudget(afterMultipleDeletes), 20);

// Removing a Proposed line with actuals excludes it from current sums without mutating its history-bearing object.
const proposedWithLinkedActuals = [
  { ...baseItem, pricePerUnit: 10, numberOfUnits: 2, actualObligationAmount: 20, actualDisbursementAmount: 10, replacementReason: 'Legacy note' },
  { id: 202, pricePerUnit: 5, numberOfUnits: 3 },
];
const removedActualBearingItem = removeSubprojectBudgetItemById(proposedWithLinkedActuals, 101);
assert.deepEqual(removedActualBearingItem.map(item => item.id), [202]);
assert.equal(getActiveSubprojectBudget(removedActualBearingItem, 'Proposed'), 15);
assert.equal(proposedWithLinkedActuals[0].actualObligationAmount, 20);
assert.equal(proposedWithLinkedActuals[0].actualDisbursementAmount, 10);
assert.equal(proposedWithLinkedActuals[0].replacementReason, 'Legacy note');

console.log('Subproject budget lifecycle checks passed.');
} finally {
  await vite.close();
}
