
import { ObjectType } from '../../constants';

// Access global XLSX from window
export const XLSX = (window as any).XLSX;

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
