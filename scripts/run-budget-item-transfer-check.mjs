import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [], entries: [] },
});

const {
  PARENT_ACTUAL_FIELDS,
  buildActualAllocation,
  buildDestinationActualAllocation,
  isTransferAccomplishmentActive,
  reparentSelectedFinancialActualRows,
  validateActualAllocation,
} = await vite.ssrLoadModule('/lib/budgetItemTransferRules.ts');
const { collectFinancialLineItems } = await vite.ssrLoadModule('/lib/financialAggregation.ts');
const { aggregateHomepagePhysicalStats } = await vite.ssrLoadModule('/lib/physicalAggregation.ts');

try {
  for (const sourceType of ['subproject', 'activity']) {
    const fields = PARENT_ACTUAL_FIELDS[sourceType];
    const source = Object.fromEntries(fields.map(({ key }, index) => [key, index + 4]));
    const destination = Object.fromEntries(fields.map(({ key }, index) => [key, index + 1]));
    const remainder = buildActualAllocation(fields, source, destination);
    const destinationActuals = buildDestinationActualAllocation(fields, source, destination);

    assert.equal(validateActualAllocation(fields, source, destination, remainder), null);
    for (const { key } of fields) {
      assert.equal(Number(remainder[key]) + Number(destinationActuals[key]), Number(source[key]));
    }
  }

  const fields = PARENT_ACTUAL_FIELDS.subproject;
  const blankSource = { actualMaleBeneficiaries: null };
  const zeroAllocation = { actualMaleBeneficiaries: 0 };
  const blankRemainder = buildActualAllocation(fields, blankSource, zeroAllocation);
  const blankDestination = buildDestinationActualAllocation(fields, blankSource, zeroAllocation);
  assert.equal(blankRemainder.actualMaleBeneficiaries, null);
  assert.equal(blankDestination.actualMaleBeneficiaries, null);
  assert.equal(validateActualAllocation(fields, blankSource, zeroAllocation, blankRemainder), null);

  const source = { actualMaleBeneficiaries: 5 };
  assert.match(
    validateActualAllocation(fields, source, { actualMaleBeneficiaries: 2.5 }, { actualMaleBeneficiaries: 2.5 }),
    /whole number/,
  );
  assert.match(
    validateActualAllocation(fields, source, { actualMaleBeneficiaries: 6 }, { actualMaleBeneficiaries: -1 }),
    /non-negative whole number/,
  );
  assert.match(
    validateActualAllocation(fields, source, { actualMaleBeneficiaries: 2 }, { actualMaleBeneficiaries: 2 }),
    /must add up to the current total/,
  );

  assert.equal(isTransferAccomplishmentActive({ workflow_status: 'PENDING' }), true);
  assert.equal(isTransferAccomplishmentActive({ workflow_status: 'REJECTED' }), true);
  assert.equal(isTransferAccomplishmentActive({ budgetItemTransferId: 'transfer-1', workflow_status: 'PENDING' }), false);
  assert.equal(isTransferAccomplishmentActive({ budgetItemTransferId: 'transfer-1', workflow_status: 'REJECTED' }), false);
  assert.equal(isTransferAccomplishmentActive({ budgetItemTransferId: 'transfer-1', workflow_status: 'APPROVED' }), true);

  const financialRows = [
    { id: 1, entity_type: 'subproject_detail', parent_id: 10, item_id: '101', amount: 25 },
    { id: 2, entity_type: 'subproject_detail', parent_id: 10, item_id: '102', amount: 30 },
    { id: 3, entity_type: 'activity_expense', parent_id: 10, item_id: '101', amount: 35 },
    { id: 4, entity_type: 'subproject_detail', parent_id: 10, item_id: null, amount: 40 },
  ];
  assert.deepEqual(
    reparentSelectedFinancialActualRows(financialRows, 'subproject', 10, 20, ['101']),
    [{ ...financialRows[0], parent_id: 20 }],
  );

  const transferredSubproject = {
    id: 91,
    name: 'Transferred project',
    status: 'Completed',
    fundingYear: 2026,
    operatingUnit: 'NPMO',
    workflow_status: 'APPROVED',
    isTransferTargetExcluded: true,
    budgetItemTransferId: 'transfer-1',
    actualCompletionDate: '2026-09-01',
    details: [{
      id: 910,
      particulars: 'Transferred item',
      pricePerUnit: 100,
      numberOfUnits: 1,
      actualObligationAmount: 40,
      actualObligationDate: '2026-09-01',
    }],
  };
  const physical = aggregateHomepagePhysicalStats({ subprojects: [transferredSubproject], ipos: [], activities: [] }, { year: '2026' });
  assert.equal(physical.subprojects.target, 0);
  assert.equal(physical.subprojects.actual, 1);

  const financial = collectFinancialLineItems({
    subprojects: [transferredSubproject],
    activities: [],
    officeReqs: [],
    staffingReqs: [],
    otherProgramExpenses: [],
  }, { year: '2026', actualYear: '2026' });
  assert.equal(financial.length, 1);
  assert.equal(financial[0].alloc, 0);
  assert.equal(financial[0].obli, 40);

  const pendingTransfer = { ...transferredSubproject, workflow_status: 'PENDING' };
  const pendingFinancial = collectFinancialLineItems({
    subprojects: [pendingTransfer],
    activities: [],
    officeReqs: [],
    staffingReqs: [],
    otherProgramExpenses: [],
  }, { year: '2026', actualYear: '2026' });
  assert.equal(pendingFinancial.length, 0);

  console.log('Budget item transfer allocation and pending-state checks passed.');
} finally {
  await vite.close();
}
