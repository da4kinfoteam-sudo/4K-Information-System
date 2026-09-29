import assert from 'node:assert/strict';
import { getProposedBudgetItemLocalBlocker, getSubprojectBudgetItemObligations } from '../lib/subprojectBudgetItemLifecycleRules.ts';

const cleanProposedLine = {
  id: 101,
  particulars: 'Seedlings',
  numberOfUnits: 100,
  pricePerUnit: 25,
  obligations: [],
  disbursements: [],
};

assert.equal(getProposedBudgetItemLocalBlocker(cleanProposedLine), null);
assert.equal(getProposedBudgetItemLocalBlocker({
  ...cleanProposedLine,
  actualDisbursementAmount: '0',
  actualDisbursementJan: '0',
}), null);
assert.equal(getProposedBudgetItemLocalBlocker({
  ...cleanProposedLine,
  actualDisbursementJan: '25',
}), 'actual disbursement records');

// The detail editor must not invent an obligation for an absent legacy amount.
for (const actualObligationAmount of [undefined, null, '', 0, '0', 'invalid', NaN, Infinity]) {
  for (const centralRows of [null, []]) {
    const item = { ...cleanProposedLine, actualObligationAmount };
    const obligations = getSubprojectBudgetItemObligations(item, centralRows);
    assert.deepEqual(obligations, [], `Unexpected obligation for ${String(actualObligationAmount)}`);
    assert.equal(getProposedBudgetItemLocalBlocker({ ...item, obligations }), null);
  }
}
for (const amount of [125, -125]) {
  const item = { ...cleanProposedLine, actualObligationAmount: amount, actualObligationDate: '2026-03-01' };
  const obligations = getSubprojectBudgetItemObligations(item, []);
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].amount, amount);
  assert.equal(getProposedBudgetItemLocalBlocker({ ...item, obligations }), 'actual obligation records');
}
const posted = [
  { id: 1, itemId: '101', date: '2026-03-01', amount: 125 },
  { id: 2, itemId: '101', date: '2026-03-01', amount: -125 },
  { id: 3, itemId: '102', date: '2026-03-01', amount: 50 },
];
const hydrated = getSubprojectBudgetItemObligations(cleanProposedLine, posted);
assert.deepEqual(hydrated, posted.slice(0, 2));
assert.equal(getProposedBudgetItemLocalBlocker({ ...cleanProposedLine, obligations: hydrated }), 'actual obligation records');
const embedded = [{ id: 4, date: '2026-03-01', amount: 25 }];
assert.deepEqual(getSubprojectBudgetItemObligations({ ...cleanProposedLine, obligations: embedded }, null), embedded);
assert.equal(getProposedBudgetItemLocalBlocker({
  ...cleanProposedLine,
  obligations: [{ date: '2026-03-01', amount: -100, remarks: 'Reversal' }],
}), 'actual obligation records');
assert.equal(getProposedBudgetItemLocalBlocker({
  ...cleanProposedLine,
  actualObligationDate: '2026-03-01',
  actualObligationAmount: 0,
}), 'actual obligation records');
assert.equal(getProposedBudgetItemLocalBlocker({
  ...cleanProposedLine,
  disbursements: [{ date: '2026-03-01', amount: 100 }],
}), 'actual disbursement records');
assert.equal(getProposedBudgetItemLocalBlocker({
  ...cleanProposedLine,
  actualDisbursementDate: '2026-03-01',
  actualDisbursementAmount: 0,
}), 'actual disbursement records');
assert.equal(getProposedBudgetItemLocalBlocker({
  ...cleanProposedLine,
  actualDeliveryDate: '2026-03-01',
}), 'physical accomplishment records');
assert.equal(getProposedBudgetItemLocalBlocker({
  ...cleanProposedLine,
  isCancelled: true,
}), 'budget adjustment or replacement history');
assert.equal(getProposedBudgetItemLocalBlocker({
  ...cleanProposedLine,
  replacementOfItemId: 100,
}), 'budget adjustment or replacement history');

console.log('Subproject budget lifecycle checks passed.');
