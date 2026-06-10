import ExcelJS from 'exceljs';
import type { ExcelColumnFormat, ReportExcelRequest, ReportExcelSheet } from '../components/reports/ReportUtils';

interface ReportSignatories {
    preparedBy: string;
    approvedBy: string;
}

const LOGO_PATH = '/assets/4klogo.png';
const HEADER_LINE_1 = 'Department of Agriculture.';
const HEADER_LINE_2 = 'Kabuhayan at Kaunlaran ng Kababayang Katutubo';
const ACCOUNTING_FORMAT = '\u20b1* #,##0;\u20b1* (#,##0);\u20b1* -';
const HEADER_TEXT_INDENT = '          ';

const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF111827' } },
    left: { style: 'thin', color: { argb: 'FF111827' } },
    bottom: { style: 'thin', color: { argb: 'FF111827' } },
    right: { style: 'thin', color: { argb: 'FF111827' } },
};

const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFF6FF' },
};

const groupHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE7F5EE' },
};

const normalizeFileName = (fileName: string) => fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;

const getFormatCode = (format?: ExcelColumnFormat) => {
    switch (format) {
        case 'money':
            return ACCOUNTING_FORMAT;
        case 'physical':
            return '#,##0';
        case 'percent':
            return '0.0%';
        case 'date':
            return 'mmm d, yyyy';
        default:
            return undefined;
    }
};

const fetchLogo = async () => {
    try {
        const response = await fetch(LOGO_PATH);
        if (!response.ok) return null;
        return await response.arrayBuffer();
    } catch {
        return null;
    }
};

const applyHeader = (
    workbook: ExcelJS.Workbook,
    worksheet: ExcelJS.Worksheet,
    sheet: ReportExcelSheet,
    request: ReportExcelRequest,
    logoBuffer: ArrayBuffer | null,
) => {
    const columnCount = Math.max(1, ...sheet.rows.map(row => row.length));
    const lastColumn = Math.max(columnCount, 7);

    worksheet.mergeCells(1, 1, 1, lastColumn);
    worksheet.mergeCells(2, 1, 2, lastColumn);
    worksheet.mergeCells(3, 1, 3, lastColumn);

    worksheet.getCell(1, 1).value = `${HEADER_TEXT_INDENT}${HEADER_LINE_1}`;
    worksheet.getCell(2, 1).value = `${HEADER_TEXT_INDENT}${HEADER_LINE_2}`;
    worksheet.getCell(3, 1).value = `${HEADER_TEXT_INDENT}${request.reportName} - ${request.ouName}`;

    [1, 2, 3].forEach(rowNumber => {
        const row = worksheet.getRow(rowNumber);
        row.height = 20;
        const cell = worksheet.getCell(rowNumber, 1);
        cell.font = { bold: true, size: 11, name: 'Arial' };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    worksheet.getColumn(1).width = Math.max(worksheet.getColumn(1).width || 0, 9);
    if (logoBuffer) {
        const imageId = workbook.addImage({
            buffer: logoBuffer as any,
            extension: 'png',
        });
        worksheet.addImage(imageId, {
            tl: { col: 0, row: 0 },
            ext: { width: 58, height: 58 },
        });
    }
};

const getMergeLabel = (sheet: ReportExcelSheet, merge: NonNullable<ReportExcelSheet['merges']>[number]) => {
    for (let rowIndex = merge.s.r; rowIndex <= merge.e.r; rowIndex += 1) {
        const row = sheet.rows[rowIndex] || [];
        for (let columnIndex = merge.s.c; columnIndex <= merge.e.c; columnIndex += 1) {
            const value = row[columnIndex];
            if (value !== null && value !== undefined && value !== '') return value;
        }
    }
    return sheet.rows[merge.s.r]?.[merge.s.c] ?? null;
};

const applySheetBody = (worksheet: ExcelJS.Worksheet, sheet: ReportExcelSheet) => {
    const dataStartRow = 6;
    const headerRows = sheet.headerRowCount ?? 1;
    const columnCount = Math.max(1, ...sheet.rows.map(row => row.length));
    const isEmptyCell = (value: unknown) => value === null || value === undefined || value === '';
    const isGroupHeaderRow = (rowValues: Array<string | number | null>, index: number) => {
        if (index < headerRows) return false;
        if (typeof rowValues[0] !== 'string' || !rowValues[0].trim()) return false;
        return rowValues.slice(1).every(isEmptyCell);
    };

    sheet.rows.forEach((rowValues, index) => {
        const rowNumber = dataStartRow + index;
        const row = worksheet.getRow(rowNumber);
        const isGroupHeader = isGroupHeaderRow(rowValues, index);

        for (let colNumber = 1; colNumber <= columnCount; colNumber += 1) {
            row.getCell(colNumber).value = rowValues[colNumber - 1] ?? null;
        }

        for (let colNumber = 1; colNumber <= columnCount; colNumber += 1) {
            const cell = row.getCell(colNumber);
            const isHeader = index < headerRows;
            cell.border = thinBorder;
            cell.alignment = {
                vertical: 'middle',
                horizontal: isHeader ? 'center' : (typeof cell.value === 'number' ? 'right' : 'left'),
                wrapText: true,
            };
            cell.font = {
                name: 'Arial',
                size: 10,
                bold: isHeader || isGroupHeader || String(rowValues[0] ?? '').toUpperCase().includes('TOTAL'),
            };
            if (isHeader) {
                cell.fill = headerFill;
            } else if (isGroupHeader) {
                cell.fill = groupHeaderFill;
            }
            const formatCode = getFormatCode(sheet.columnFormats?.[colNumber - 1]);
            if (formatCode && typeof cell.value === 'number') {
                cell.numFmt = formatCode;
            }
        }

        if (isGroupHeader && columnCount > 1) {
            worksheet.mergeCells(rowNumber, 1, rowNumber, columnCount);
            const groupCell = worksheet.getCell(rowNumber, 1);
            groupCell.value = rowValues[0];
            groupCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            groupCell.font = { name: 'Arial', size: 10, bold: true };
            groupCell.fill = groupHeaderFill;
            groupCell.border = thinBorder;
        }
    });

    sheet.merges?.forEach(merge => {
        const startRow = dataStartRow + merge.s.r;
        const startColumn = merge.s.c + 1;
        const endRow = dataStartRow + merge.e.r;
        const endColumn = merge.e.c + 1;
        const label = getMergeLabel(sheet, merge);

        worksheet.mergeCells(startRow, startColumn, endRow, endColumn);

        const topLeftCell = worksheet.getCell(startRow, startColumn);
        if (!isEmptyCell(label)) {
            topLeftCell.value = label;
        }

        const isHeaderMerge = merge.s.r < headerRows;
        for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
            for (let columnNumber = startColumn; columnNumber <= endColumn; columnNumber += 1) {
                const cell = worksheet.getCell(rowNumber, columnNumber);
                cell.border = thinBorder;
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: isHeaderMerge ? 'center' : 'left',
                    wrapText: true,
                };
                cell.font = {
                    name: 'Arial',
                    size: 10,
                    bold: isHeaderMerge || String(topLeftCell.value ?? '').toUpperCase().includes('TOTAL'),
                };
                if (isHeaderMerge) {
                    cell.fill = headerFill;
                }
            }
        }
    });

    sheet.columnWidths?.forEach((width, index) => {
        worksheet.getColumn(index + 1).width = width;
    });

    worksheet.views = [{ showGridLines: false }];
};

const applySignatures = (worksheet: ExcelJS.Worksheet, sheet: ReportExcelSheet, signatories: ReportSignatories) => {
    const columnCount = Math.max(6, ...sheet.rows.map(row => row.length));
    const tableStartRow = 6;
    const tableEndRow = tableStartRow + sheet.rows.length - 1;
    const labelRow = tableEndRow + 4;
    const lineRow = labelRow + 2;
    const nameRow = lineRow + 1;

    const signatureBlocks = [
        { start: 1, end: 2, name: signatories.preparedBy, label: 'Prepared By:' },
        { start: Math.min(5, columnCount), end: Math.min(6, columnCount), name: signatories.approvedBy, label: 'Approved By:' },
    ];

    signatureBlocks.forEach(block => {
        worksheet.mergeCells(labelRow, block.start, labelRow, block.end);
        worksheet.mergeCells(lineRow, block.start, lineRow, block.end);
        worksheet.mergeCells(nameRow, block.start, nameRow, block.end);

        const labelCell = worksheet.getCell(labelRow, block.start);
        labelCell.value = block.label;
        labelCell.font = { name: 'Arial', size: 9, bold: true };
        labelCell.alignment = { horizontal: 'left', vertical: 'middle' };

        for (let column = block.start; column <= block.end; column += 1) {
            worksheet.getCell(lineRow, column).border = {
                bottom: { style: 'thin', color: { argb: 'FF111827' } },
            };
        }

        const nameCell = worksheet.getCell(nameRow, block.start);
        nameCell.value = block.name;
        nameCell.font = { bold: true, name: 'Arial', size: 10 };
        nameCell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
};

export const exportReportWorkbook = async (request: ReportExcelRequest, signatories: ReportSignatories) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '4K Information System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const logoBuffer = await fetchLogo();

    request.sheets.forEach(sheet => {
        const worksheet = workbook.addWorksheet(sheet.sheetName.substring(0, 31), {
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
            properties: { defaultRowHeight: 18 },
        });
        applyHeader(workbook, worksheet, sheet, request, logoBuffer);
        applySheetBody(worksheet, sheet);
        applySignatures(worksheet, sheet, signatories);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = normalizeFileName(request.fileName);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};
