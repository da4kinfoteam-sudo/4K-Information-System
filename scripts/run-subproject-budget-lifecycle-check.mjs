import assert from 'node:assert/strict';
import { getProposedBudgetItemLocalBlocker } from '../lib/subprojectBudgetItemLifecycleRules.ts';

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
