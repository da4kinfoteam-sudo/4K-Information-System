
import React from 'react';
import { OfficeRequirement } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';

export const constructOfficeRequirement = (id: number, uid: string, formData: any, commonFields: any, accomplishmentFields: any): OfficeRequirement => {
    return {
        id,
        uid,
        ...commonFields,
        ...accomplishmentFields,
        equipment: formData.equipment,
        specs: formData.specs,
        purpose: formData.purpose,
        numberOfUnits: Number(formData.numberOfUnits),
        pricePerUnit: Number(formData.pricePerUnit)
    };
};

export const parseOfficeRequirementRow = (row: any, commonData: any): OfficeRequirement => {
    return {
        ...commonData,
        equipment: row.equipment || '',
        specs: row.specs || '',
        purpose: row.purpose || '',
        numberOfUnits: Number(row.numberOfUnits) || 0,
        pricePerUnit: Number(row.pricePerUnit) || 0,
    };
};

interface OfficeRequirementsTableProps {
    items: OfficeRequirement[];
    canEdit: boolean;
    isSelectionMode: boolean;
    selectedIds: number[];
    onSelectRow: (id: number) => void;
    onEdit: (item: OfficeRequirement) => void;
    onDelete: (item: OfficeRequirement) => void;
}

export const OfficeRequirementsTable: React.FC<OfficeRequirementsTableProps> = ({
    items, canEdit, isSelectionMode, selectedIds, onSelectRow, onEdit, onDelete
}) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">UID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">OU</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Equipment</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Specs/Purpose</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fund</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            {isSelectionMode ? "Select" : "Actions"}
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {items.length === 0 ? (
                        <tr><td colSpan={8} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No records found.</td></tr>
                    ) : (
                        items.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{item.uid}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.operatingUnit}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.equipment}</td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                                    <div className="truncate w-48" title={item.specs}>{item.specs}</div>
                                    <div className="text-xs text-gray-400 truncate w-48">{item.purpose}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-300">{item.numberOfUnits}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.numberOfUnits * item.pricePerUnit)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                    <div>{item.fundType} {item.fundYear}</div>
                                    <div>{item.tier}</div>
                                    <div className="mt-1 text-xs font-mono">{item.uacsCode}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    {canEdit && (
                                        <>
                                            {isSelectionMode ? (
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.includes(item.id)} 
                                                    onChange={(e) => { e.stopPropagation(); onSelectRow(item.id); }} 
                                                    className="mr-3 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                />
                                            ) : (
                                                <>
                                                    <button onClick={() => onEdit(item)} className="text-accent hover:text-green-900 mr-3">Edit</button>
                                                    <button onClick={() => onDelete(item)} className="text-red-600 hover:text-red-900">Delete</button>
                                                </>
                                            )}
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

interface OfficeRequirementsFormFieldsProps {
    formData: any;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    commonInputClasses: string;
}

export const OfficeRequirementsFormFields: React.FC<OfficeRequirementsFormFieldsProps> = ({
    formData, handleInputChange, commonInputClasses
}) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Equipment</label>
                <input type="text" name="equipment" value={formData.equipment} onChange={handleInputChange} required className={commonInputClasses} />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Specifications</label>
                <input type="text" name="specs" value={formData.specs} onChange={handleInputChange} className={commonInputClasses} />
            </div>
            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Purpose</label>
                <textarea name="purpose" value={formData.purpose} onChange={handleInputChange} rows={2} className={commonInputClasses} />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">No. of Units</label>
                <input type="number" name="numberOfUnits" value={formData.numberOfUnits} onChange={handleInputChange} min="0" className={commonInputClasses} />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price per Unit</label>
                <input type="number" name="pricePerUnit" value={formData.pricePerUnit} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} />
            </div>
            <div className="md:col-span-2 text-right font-bold text-lg mt-2 text-gray-800 dark:text-white">
                Total: {formatCurrency((Number(formData.numberOfUnits) || 0) * (Number(formData.pricePerUnit) || 0))}
            </div>
        </div>
    );
};
