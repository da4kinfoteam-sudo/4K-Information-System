
import { ObjectType } from '../../constants';

// Access global XLSX from window
export const XLSX = (window as any).XLSX;

export type ExcelColumnFormat = 'text' | 'money' | 'physical' | 'percent' | 'date';

export interface ReportPrintRequest {
    reportName: string;
    ouName: string;
    tableElementId: string;
    sectionName?: string;
}

export interface ReportExcelMerge {
    s: { r: number; c: number };
    e: { r: number; c: number };
}

export interface ReportExcelSheet {
    sheetName: string;
    rows: Array<Array<string | number | null>>;
    merges?: ReportExcelMerge[];
    columnWidths?: number[];
    headerRowCount?: number;
    columnFormats?: Record<number, ExcelColumnFormat>;
}

export interface ReportExcelRequest {
    reportName: string;
    ouName: string;
    fileName: string;
    sheets: ReportExcelSheet[];
}

type ParentPhysicalRecord = {
    isRealignment?: boolean;
    isSavings?: boolean;
};

export const isParentRealignmentOrSavings = (record?: ParentPhysicalRecord | null) =>
    !!(record?.isRealignment || record?.isSavings);

export const countPhysicalTarget = (record: ParentPhysicalRecord | null | undefined, value: number) =>
    isParentRealignmentOrSavings(record) ? 0 : value;

export const countPhysicalActual = (_record: ParentPhysicalRecord | null | undefined, value: number) => value;

export const deriveExcelHeaderMerges = (
    rows: Array<Array<string | number | null>>,
    headerRowCount: number,
): ReportExcelMerge[] => {
    const merges: ReportExcelMerge[] = [];
    const occupied = new Set<string>();
    const isBlank = (value: unknown) => value === null || value === undefined || value === '';
    const mark = (startRow: number, startColumn: number, endRow: number, endColumn: number) => {
        for (let row = startRow; row <= endRow; row += 1) {
            for (let column = startColumn; column <= endColumn; column += 1) {
                occupied.add(`${row}:${column}`);
            }
        }
    };
    const isOccupied = (row: number, column: number) => occupied.has(`${row}:${column}`);

    for (let rowIndex = 0; rowIndex < headerRowCount; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
            if (isBlank(row[columnIndex]) || isOccupied(rowIndex, columnIndex)) continue;

            let endColumn = columnIndex;
            while (endColumn + 1 < row.length && isBlank(row[endColumn + 1])) {
                endColumn += 1;
            }

            if (endColumn > columnIndex) {
                merges.push({ s: { r: rowIndex, c: columnIndex }, e: { r: rowIndex, c: endColumn } });
                mark(rowIndex, columnIndex, rowIndex, endColumn);
            }
        }
    }

    for (let rowIndex = 0; rowIndex < headerRowCount; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
            if (isBlank(row[columnIndex]) || isOccupied(rowIndex, columnIndex)) continue;

            let endRow = rowIndex;
            while (endRow + 1 < headerRowCount && isBlank(rows[endRow + 1]?.[columnIndex])) {
                endRow += 1;
            }

            if (endRow > rowIndex) {
                merges.push({ s: { r: rowIndex, c: columnIndex }, e: { r: endRow, c: columnIndex } });
                mark(rowIndex, columnIndex, endRow, columnIndex);
            }
        }
    }

    return merges;
};

export const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};

export const getObjectTypeByCode = (code: string, uacsCodes: any): ObjectType => {
    for (const type of ['MOOE', 'CO']) {
        if (uacsCodes[type]) {
             for (const particular in uacsCodes[type]) {
                 if (uacsCodes[type][particular] && uacsCodes[type][particular][code]) return type as ObjectType;
            }
        }
    }
    return 'MOOE';
};
