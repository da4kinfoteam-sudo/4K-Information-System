import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
    calculateGadAttribution,
    GAD_HGDG_ATTRIBUTION_RATE,
    GAD_HGDG_SCORE,
    summarizeGadAttribution,
} from '../lib/gadAttribution.ts';
import { buildGadAttributionWorkbook } from '../lib/gadAttributionExcel.ts';

const assertClose = (actual, expected, tolerance = 0.000001) => {
    assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
};

assert.equal(GAD_HGDG_SCORE, 17.33);
assertClose(GAD_HGDG_ATTRIBUTION_RATE, 0.8665);

const assessed = calculateGadAttribution({
    allocation: 1_000_000,
    obligation: 800_000,
    pimmeScore: 15,
});
assertClose(assessed.attributableAllocation, 866_500);
assert.equal(assessed.pimmeRate, 0.75);
assert.equal(assessed.attributableObligation, 600_000);
assertClose(assessed.utilization ?? 0, 69.2440854001154);

const unassessed = calculateGadAttribution({
    allocation: 500_000,
    obligation: 200_000,
    pimmeScore: null,
});
assertClose(unassessed.attributableAllocation, 433_250);
assert.equal(unassessed.attributableObligation, null);
assert.equal(unassessed.utilization, null);

const correction = calculateGadAttribution({
    allocation: 250_000,
    obligation: -40_000,
    pimmeScore: 10,
});
assert.equal(correction.attributableObligation, -20_000);

const zeroAllocation = calculateGadAttribution({
    allocation: 0,
    obligation: 100_000,
    pimmeScore: 10,
});
assert.equal(zeroAllocation.attributableAllocation, 0);
assert.equal(zeroAllocation.attributableObligation, 50_000);
assert.equal(zeroAllocation.utilization, null);

const totals = summarizeGadAttribution([
    { allocation: 1_000_000, obligation: 800_000, ...assessed },
    { allocation: 500_000, obligation: 200_000, ...unassessed },
    { allocation: 250_000, obligation: -40_000, ...correction },
]);
assert.equal(totals.allocation, 1_750_000);
assertClose(totals.attributableAllocation, 1_516_375);
assert.equal(totals.attributableObligation, 580_000);
assert.equal(totals.hasAttributedObligation, true);

const workbook = buildGadAttributionWorkbook({
    year: 2026,
    ouScope: 'All OUs',
    generatedAt: new Date('2026-08-25T00:00:00Z'),
    rows: [
        {
            ou: 'NPMO',
            state: 'Completed',
            pimmeScore: 15,
            allocation: 1_000_000,
            obligation: 800_000,
            attributableAllocation: assessed.attributableAllocation,
            attributableObligation: assessed.attributableObligation,
        },
        {
            ou: 'RPMO CAR',
            state: 'Incomplete',
            pimmeScore: null,
            allocation: 500_000,
            obligation: 200_000,
            attributableAllocation: unassessed.attributableAllocation,
            attributableObligation: unassessed.attributableObligation,
        },
    ],
});
const output = await workbook.xlsx.writeBuffer();
assert.ok(output.byteLength > 0);

const parsed = new ExcelJS.Workbook();
await parsed.xlsx.load(output);
const sheet = parsed.getWorksheet('2026');
assert.ok(sheet);
assert.equal(sheet.getCell('C7').value, 'DA-4K PROGRAM BUDGET FOR CY 2026');
assert.equal(sheet.getCell('C8').value, 'Region / OU');
assert.equal(sheet.getCell('F9').value.formula, '(17.33/20)*D9');
assertClose(sheet.getCell('F9').value.result, 866_500);
assert.equal(sheet.getCell('I9').value.formula, '(G9/20)*H9');
assert.equal(sheet.getCell('I9').value.result, 600_000);
assert.equal(sheet.getCell('G10').value, null);
assert.equal(sheet.getCell('I10').value, null);
assert.equal(sheet.getCell('D11').value.formula, 'SUM(D9:D10)');
assert.equal(sheet.getCell('D11').value.result, 1_500_000);
assert.equal(sheet.pageSetup.orientation, 'landscape');

console.log('GAD attribution calculation and workbook checks passed.');
