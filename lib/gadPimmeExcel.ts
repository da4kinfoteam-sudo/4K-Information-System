import type ExcelJS from 'exceljs';
import { GAD_PIMME_CHECKLIST, GAD_PIMME_QUESTIONS } from './gadPimmeChecklist.ts';
import { calculateGadPimmeScore, getGadPimmeClassification, type GadPimmeAnswerInput } from './gadPimmeScoring.ts';
import { getGadPimmeSignatories, type GadPimmeStoredSignatories } from './gadPimmeSignatories.ts';

export const GAD_PIMME_TEMPLATE_PATH = new URL('../templates/gad-pimme-box-16-and-17.xlsx', import.meta.url).href;
export const GAD_PIMME_EXPORT_ROWS = [9, 11, 14, 16, 18, 21, 23, 26, 28, 30, 32, 40, 42, 45, 47, 49, 51, 54, 57, 59, 62, 64];
const ELEMENT_ROWS = [8, 13, 20, 25, 39, 44, 53, 59, 61];

export interface GadPimmeExportMov {
    id: number;
    assessment_id: number;
    question_key: string;
    file_id: string;
    file_name: string;
    web_view_link?: string | null;
    web_content_link?: string | null;
    deleted_at?: string | null;
}

export interface GadPimmeExportInput {
    assessmentId: number;
    operatingUnit: string;
    year: number;
    answers: readonly GadPimmeAnswerInput[];
    signatories?: GadPimmeStoredSignatories;
    movs: readonly GadPimmeExportMov[];
}

const safeLink = (value?: string | null) => {
    try {
        const url = new URL(value || '');
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch { return null; }
};

const textLines = (text: string, width: number) => text.split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / width)), 0);
const textChunks = (text: string) => {
    const chunks: string[] = [];
    let start = 0, lineStart = 0, lines = 1;
    for (let index = 0; index < text.length; index++) {
        if (text[index] !== '\n' && index - lineStart < 80) continue;
        lineStart = index + 1;
        if (++lines <= 20) continue;
        chunks.push(text.slice(start, index + 1));
        start = index + 1; lines = 1;
    }
    if (start < text.length) chunks.push(text.slice(start));
    return chunks;
};
const literal = (value: string) => {
    if (value.length > 32767) throw new Error('A PIMME text field exceeds the Excel cell limit. Shorten it before exporting.');
    return value;
};

export const getGadPimmeExportFilename = (operatingUnit: string, year: number) =>
    `PIMME_${operatingUnit.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'OU'}_${year}.xlsx`;

export const buildGadPimmeWorkbook = async (input: GadPimmeExportInput, template: ArrayBuffer | Uint8Array) => {
    const { default: Excel } = await import('exceljs');
    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(template as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Box 16 and 17');
    if (!sheet || !workbook.getWorksheet('Guide to filling out box 16 and')) throw new Error('The PIMME export template is unavailable or invalid.');
    const score = calculateGadPimmeScore(input.answers);
    const answers = new Map(input.answers.map(answer => [answer.questionKey, answer]));
    const signatories = getGadPimmeSignatories(input.signatories);
    const keys = new Set(GAD_PIMME_QUESTIONS.map(question => question.key));
    const seen = new Set<string>();
    const movs = input.movs.filter(file => {
        if (file.assessment_id !== input.assessmentId || file.deleted_at || !keys.has(file.question_key) || seen.has(file.file_id)) return false;
        seen.add(file.file_id);
        return true;
    });
    workbook.creator = '4K Information System';
    workbook.calcProperties.fullCalcOnLoad = true;
    sheet.getCell('B3').value = literal(`Operating Unit: ${input.operatingUnit} | Assessment year: ${input.year}`);
    sheet.getCell('B4').value = 'Date Accomplished:';
    sheet.getCell('H3').value = { formula: 'F68', result: score.totalScore };
    sheet.getCell('H4').value = {
        formula: 'IF(F68>=15,"Gender-Responsive",IF(F68>=8,"Gender-Sensitive",IF(F68>=4,"Promising GAD Prospects","GAD-Invisible")))',
        result: getGadPimmeClassification(score.totalScore),
    };
    sheet.getCell('H6').value = 'MOVs';
    sheet.getCell('H37').value = 'MOVs';
    sheet.getCell('I6').value = 'RECOMMENDATIONS / ACTION POINTS';
    sheet.getCell('I37').value = 'RECOMMENDATIONS / ACTION POINTS';

    const movSheet = movs.length ? workbook.addWorksheet('MOVs') : null;
    if (movSheet) {
        movSheet.columns = [{ header: 'Question', width: 18 }, { header: 'MOV filename', width: 65 }, { header: 'Link', width: 85 }];
        movs.forEach(file => {
            const url = safeLink(file.web_view_link) || safeLink(file.web_content_link);
            movSheet.addRow([file.question_key, literal(file.file_name), url ? { text: url, hyperlink: url } : null]);
        });
        movSheet.getRow(1).font = { name: 'Calibri', size: 11, bold: true };
        movSheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
        movSheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
        movSheet.autoFilter = 'A1:C1';
        movSheet.eachRow((row, index) => {
            if (index > 1) { row.font = { name: 'Calibri', size: 11 }; row.alignment = { vertical: 'top', wrapText: true }; }
            row.height = Math.max(20, 10 + 15 * Math.max(textLines(row.getCell(2).text, 60), textLines(row.getCell(3).text, 80)));
            row.eachCell({ includeEmpty: true }, cell => { cell.border = {
                top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
            }; });
            if (index > 1 && row.getCell(3).hyperlink) row.getCell(3).font = { name: 'Calibri', size: 11, color: { argb: 'FF0563C1' }, underline: true };
        });
        movSheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, showGridLines: false, printTitlesRow: '1:1' };
    }

    let remarksSheet: ExcelJS.Worksheet | undefined;
    const fullRemarksLink = (questionKey: string, remarks: string) => {
        if (!remarksSheet) {
            remarksSheet = workbook.addWorksheet('Remarks');
            remarksSheet.columns = [{ header: 'Question', width: 18 }, { header: 'Full remarks (continued rows)', width: 100 }];
            remarksSheet.getRow(1).font = { name: 'Calibri', size: 11, bold: true };
            remarksSheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
            remarksSheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
            remarksSheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, showGridLines: false, printTitlesRow: '1:1' };
        }
        const firstRow = remarksSheet.rowCount + 1;
        textChunks(remarks).forEach(chunk => {
            const row = remarksSheet!.addRow([questionKey, chunk]);
            row.font = { name: 'Calibri', size: 11 };
            row.alignment = { vertical: 'top', wrapText: true };
            row.height = Math.min(409, 15 + 15 * textLines(chunk, 85));
            row.eachCell(cell => { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; });
        });
        return { text: 'Full remarks: see Remarks worksheet.', hyperlink: `#'Remarks'!B${firstRow}` };
    };

    GAD_PIMME_QUESTIONS.forEach((question, index) => {
        const row = GAD_PIMME_EXPORT_ROWS[index];
        const answer = answers.get(question.key);
        for (let column = 3; column <= 5; column++) sheet.getCell(row, column).value = null;
        const responseIndex = question.choices.findIndex(choice => choice.response === answer?.response);
        if (responseIndex >= 0) sheet.getCell(row, 3 + responseIndex).value = question.choices[responseIndex].points;
        const point = score.pointsByQuestion[question.key];
        sheet.getCell(`F${row}`).value = { formula: `IF(COUNT(C${row}:E${row})=0,"",SUM(C${row}:E${row}))`, result: answer?.response ? point : '' };
        const remarks = answer?.remarks || '';
        const continuedRemarks = textLines(remarks, 25) > 45;
        const remarksValue = continuedRemarks ? fullRemarksLink(question.key, remarks) : (remarks || null);
        sheet.getCell(`G${row}`).value = remarksValue;
        const files = movs.filter(file => file.question_key === question.key);
        const names = files.map(file => file.file_name).join('\n');
        const displayNames = textLines(names, 35) > 45 ? `${files.length} MOVs: see MOVs worksheet.` : names;
        const link = files.length === 1
            ? safeLink(files[0].web_view_link) || safeLink(files[0].web_content_link)
            : files.length ? `#'MOVs'!A${movs.indexOf(files[0]) + 2}` : null;
        for (const column of ['H', 'I']) {
            sheet.getCell(`${column}${row}`).value = null;
            sheet.getCell(`${column}${row + 1}`).value = null;
            sheet.mergeCells(`${column}${row}:${column}${row + 1}`);
        }
        sheet.getCell(`H${row}`).value = displayNames ? (link ? { text: displayNames, hyperlink: link } : displayNames) : null;
        if (link) sheet.getCell(`H${row}`).font = { name: 'Calibri', size: 11, color: { argb: 'FF0563C1' }, underline: true };
        sheet.getCell(`G${row}`).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        sheet.getCell(`H${row}`).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        const requiredHeight = Math.max(
            (sheet.getRow(row).height || 15) + (sheet.getRow(row + 1).height || 15),
            12 + 15 * Math.max(textLines(`${question.label} ${question.text}`, 52), textLines(continuedRemarks ? 'Full remarks: see Remarks worksheet.' : remarks, 25), textLines(displayNames, 35)),
        );
        sheet.getRow(row).height = requiredHeight / 2;
        sheet.getRow(row + 1).height = requiredHeight / 2;
    });

    GAD_PIMME_CHECKLIST.flatMap(box => box.elements).forEach((element, index) => {
        // Box 17 element 4 is itself a scored question, not an additional subtotal.
        if (element.key === 'box17-element-4') return;
        const references = element.questions.map(question => `F${GAD_PIMME_EXPORT_ROWS[GAD_PIMME_QUESTIONS.findIndex(item => item.key === question.key)]}`).join(',');
        sheet.getCell(`F${ELEMENT_ROWS[index]}`).value = {
            formula: `MIN(${element.maxScore},ROUND(SUM(${references}),2))`, result: score.elementScores[element.key],
        };
    });
    sheet.getCell('F34').value = { formula: 'MIN(8,ROUND(SUM(F8,F13,F20,F25),2))', result: score.box16Score };
    sheet.getCell('F66').value = { formula: 'MIN(12,ROUND(SUM(F39,F44,F53,F59,F61),2))', result: score.box17Score };
    sheet.getCell('F67').value = { formula: 'F34', result: score.box16Score };
    sheet.getCell('F68').value = { formula: 'MIN(20,ROUND(SUM(F66:F67),2))', result: score.totalScore };
    [['B', 'prepared'], ['D', 'reviewed'], ['H', 'approved']].forEach(([column, role]) => {
        sheet.getCell(`${column}71`).value = literal(signatories[`${role}_by_name` as keyof typeof signatories]) || null;
        sheet.getCell(`${column}72`).value = literal(signatories[`${role}_by_position` as keyof typeof signatories]) || null;
        sheet.getCell(`${column}71`).alignment = { horizontal: 'center', vertical: 'bottom', wrapText: true };
        sheet.getCell(`${column}72`).alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
    });
    const signatoryWidths = [50, 30, 70];
    sheet.getRow(71).height = Math.max(55.5, ...[signatories.prepared_by_name, signatories.reviewed_by_name, signatories.approved_by_name].map((value, index) => textLines(value, signatoryWidths[index]) * 15));
    sheet.getRow(72).height = Math.max(30, ...[signatories.prepared_by_position, signatories.reviewed_by_position, signatories.approved_by_position].map((value, index) => textLines(value, signatoryWidths[index]) * 15));
    [6, 7, 37, 38].forEach(row => sheet.getRow(row).eachCell(cell => {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }));
    sheet.pageSetup = { ...sheet.pageSetup, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: 'B2:I77', showGridLines: false };
    workbook.worksheets.forEach(worksheet => {
        worksheet.views = ['MOVs', 'Remarks'].includes(worksheet.name) ? worksheet.views : [{ showGridLines: false }];
        worksheet.pageSetup.showGridLines = false;
    });
    return workbook;
};

export const downloadGadPimmeWorkbook = async (input: GadPimmeExportInput) => {
    const response = await fetch(GAD_PIMME_TEMPLATE_PATH);
    if (!response.ok) throw new Error('Unable to load the PIMME Excel template. Please retry.');
    const workbook = await buildGadPimmeWorkbook(input, await response.arrayBuffer());
    const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = getGadPimmeExportFilename(input.operatingUnit, input.year);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
