import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { buildGadPimmeWorkbook, GAD_PIMME_EXPORT_ROWS, getGadPimmeExportFilename } from '../lib/gadPimmeExcel.ts';
import { GAD_PIMME_QUESTIONS } from '../lib/gadPimmeChecklist.ts';
import { getGadPimmeSignatories, getGadPimmeSignatoryPayload } from '../lib/gadPimmeSignatories.ts';

const template = await readFile('templates/gad-pimme-box-16-and-17.xlsx');
const base = { assessmentId: 7, operatingUnit: 'RPMO 1', year: 2025, answers: [], movs: [] };
const allYes = GAD_PIMME_QUESTIONS.map(question => ({ questionKey: question.key, response: 'Yes' }));
assert.equal(Object.values(getGadPimmeSignatories()).every(value => value === ''), true);
assert.equal(getGadPimmeSignatoryPayload({ ...getGadPimmeSignatories(), prepared_by_name: ' Person ' }).prepared_by_name, 'Person');
assert.equal(getGadPimmeSignatoryPayload(getGadPimmeSignatories()).approved_by_name, null);
assert.equal(getGadPimmeExportFilename('../../RPMO 1?', 2025), 'PIMME_RPMO_1_2025.xlsx');

const maximum = await buildGadPimmeWorkbook({ ...base, answers: allYes }, template);
const maxSheet = maximum.getWorksheet('Box 16 and 17');
assert.equal(maxSheet.getCell('F34').result, 8);
assert.equal(maxSheet.getCell('F66').result, 12);
assert.equal(maxSheet.getCell('F68').result, 20);
assert.equal(maxSheet.getCell('F13').result, 2, '0.67 x 3 remains capped at 2');
assert.match(maxSheet.getCell('F11').formula, /COUNT/);
assert.equal(maxSheet.getCell('F66').formula, 'MIN(12,ROUND(SUM(F39,F44,F53,F59,F61),2))');
assert.equal(maxSheet.getCell('H3').result, 20);
assert.equal(maxSheet.getCell('H4').result, 'Gender-Responsive');

const mov = (id, patch = {}) => ({ id, assessment_id: 7, question_key: 'box16-1.1', file_id: String(id), file_name: `MOV ${id}.pdf`, web_view_link: `https://drive.google.com/file/d/${id}/view`, ...patch });
const remarks = '=HYPERLINK("https://bad.example","not a formula")\n' + 'A detailed explanatory remark that must remain visible. '.repeat(10);
const partial = await buildGadPimmeWorkbook({ ...base,
    answers: [{ questionKey: 'box16-1.1', response: 'No', remarks }, { questionKey: 'box16-2.1', response: 'Partly Yes' }],
    signatories: { prepared_by_name: '=literal name', prepared_by_position: 'GAD Staff', reviewed_by_name: 'Reviewer', reviewed_by_position: 'GAD Focal Person', approved_by_name: 'Approver', approved_by_position: 'Head of Office' },
    movs: [mov(1), mov(2), mov(3), mov(1), mov(4, { deleted_at: '2026-01-01' }), mov(5, { assessment_id: 88 }), mov(6, { question_key: 'unknown' }), mov(7, { question_key: 'box17-5.2', web_view_link: 'javascript:alert(1)', web_content_link: null })],
}, template);
const bytes = await partial.xlsx.writeBuffer();
const parsed = new ExcelJS.Workbook();
await parsed.xlsx.load(bytes);
const sheet = parsed.getWorksheet('Box 16 and 17');
assert.equal(sheet.getCell('C9').value, 0);
assert.equal(sheet.getCell('D9').value, null);
assert.equal(sheet.getCell('E9').value, null);
assert.equal(sheet.getCell('C11').value, null, 'Unanswered is not a selected No');
assert.equal(sheet.getCell('F11').result, undefined, 'Blank cached result serializes as an empty formula result');
assert.equal(sheet.getCell('D14').value, 0.33);
assert.equal(sheet.getCell('F68').result, 0.33);
assert.equal(sheet.getCell('G9').value, remarks);
assert.equal(sheet.getCell('G9').type, ExcelJS.ValueType.String);
assert.equal(sheet.getCell('B71').value, '=literal name');
assert.equal(sheet.getCell('B71').type, ExcelJS.ValueType.String);
assert.equal(sheet.getCell('D72').value, 'GAD Focal Person');
assert.equal(sheet.getCell('H72').value, 'Head of Office');
assert.equal(sheet.getCell('H9').text, 'MOV 1.pdf\nMOV 2.pdf\nMOV 3.pdf');
assert.equal(sheet.getCell('H9').hyperlink, "#'MOVs'!A2");
assert.equal(sheet.getCell('H64').text, 'MOV 7.pdf');
assert.equal(sheet.getCell('H64').hyperlink, undefined, 'Unsafe links remain inert filename text');
assert.equal(sheet.getCell('I9').value, null, 'Evaluator content is not invented');
assert.equal(sheet.getCell('I10').value, null);
assert.equal(sheet.getCell('B4').value, 'Date Accomplished:', 'No date is invented');
assert.match(sheet.getCell('B3').value, /RPMO 1.*2025/);
assert.equal(sheet.getCell('H6').value, 'MOVs');
assert.equal(sheet.getCell('H37').value, 'MOVs');
assert.equal(sheet.getCell('B6').alignment.horizontal, 'center');
assert.equal(sheet.getCell('B9').alignment.wrapText, true);
assert.equal(sheet.getCell('G9').alignment.vertical, 'top');
assert(sheet.model.merges.includes('B2:I2'));
assert(sheet.model.merges.includes('C6:E6'));
assert(sheet.model.merges.includes('H9:H10'));
assert.equal(sheet.getCell('C7').border.left.style, 'thin');
assert(sheet.getRow(9).height + sheet.getRow(10).height > 250, 'Long remarks expand merged rows');
assert.equal(sheet.pageSetup.printArea, 'B2:I77');
for (const worksheet of parsed.worksheets) {
    assert.equal(worksheet.views[0].showGridLines, false);
    assert.equal(Boolean(worksheet.pageSetup.showGridLines), false, 'Excel omits false print-gridline flags on roundtrip');
}
assert.equal(parsed.getWorksheet('MOVs').rowCount, 5);
assert.equal(parsed.getWorksheet('MOVs').getCell('C2').hyperlink, 'https://drive.google.com/file/d/1/view');
assert(parsed.getWorksheet('Guide to filling out box 16 and').getCell('B3').text.includes('scoring system'));
assert.equal(GAD_PIMME_EXPORT_ROWS.length, 22);
const empty = await buildGadPimmeWorkbook(base, template);
assert.equal(empty.worksheets.length, 2);
assert.equal(empty.getWorksheet('Box 16 and 17').getCell('F68').result, 0);
const longRemarks = 'Long unabridged remarks\n'.repeat(500);
const large = await buildGadPimmeWorkbook({ ...base, answers: [{ questionKey: 'box16-1.1', response: 'Yes', remarks: longRemarks }], movs: Array.from({ length: 100 }, (_, index) => mov(index + 1)) }, template);
const fullRemarksSheet = large.getWorksheet('Remarks');
let reconstructed = '';
fullRemarksSheet.eachRow((row, index) => { if (index > 1) reconstructed += row.getCell(2).value; assert(row.height <= 409 || !row.height); });
assert.equal(reconstructed, longRemarks, 'Very long remarks are preserved verbatim across printable continuation rows');
assert.equal(large.getWorksheet('MOVs').rowCount, 101);
assert.match(large.getWorksheet('Box 16 and 17').getCell('G9').hyperlink, /Remarks/);
assert.match(large.getWorksheet('Box 16 and 17').getCell('H9').text, /100 MOVs/);

const output = await mkdtemp(path.join(tmpdir(), '4kis-gad-pimme-export-'));
await writeFile(path.join(output, 'partial.xlsx'), bytes);
await writeFile(path.join(output, 'all-yes.xlsx'), await maximum.xlsx.writeBuffer());
await writeFile(path.join(output, 'long-content.xlsx'), await large.xlsx.writeBuffer());
console.log('GAD PIMME export checks passed. Synthetic workbooks: ' + output);
