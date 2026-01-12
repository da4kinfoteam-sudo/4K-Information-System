
import React from 'react';
import { StaffingRequirement } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';

export const constructStaffingRequirement = (id: number, uid: string, formData: any, commonFields: any, accomplishmentFields: any): StaffingRequirement => {
    return {
        id,
        uid,
        ...commonFields,
        ...accomplishmentFields,
        personnelPosition: formData.personnelPosition,
        status: formData.status as any,
        salaryGrade: Number(formData.salaryGrade),
        annualSalary: Number(formData.annualSalary),
        personnelType: formData.personnelType as any
    };
};

export const parseStaffingRequirementRow = (row: any, commonData: any): StaffingRequirement => {
    return {
        ...commonData,
        personnelPosition: row.personnelPosition || '',
        status: row.status || 'Contractual',
        salaryGrade: Number(row.salaryGrade) || 1,
        annualSalary: Number(row.annualSalary) || 0,
        personnelType: row.personnelType || 'Technical'
    };
};

interface StaffingRequirementsTableProps {
    items: StaffingRequirement[];
    canEdit: boolean;
    isSelectionMode: boolean;
    selectedIds: number[];
    onSelectRow: (id: number) => void;
    onEdit: (item: StaffingRequirement) => void;
    onDelete: (item: StaffingRequirement) => void;
}

export const StaffingRequirementsTable: React.FC<StaffingRequirementsTableProps> = ({
    items, canEdit, isSelectionMode, selectedIds, onSelectRow, onEdit, onDelete
}) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">UID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">OU</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Position</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Annual Salary</th>
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
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    {item.personnelPosition}
                                    <div className="text-xs text-gray-400">SG-{item.salaryGrade}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.status}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.personnelType}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.annualSalary)}</td>
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

interface StaffingRequirementsFormFieldsProps {
    formData: any;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    commonInputClasses: string;
}

export const StaffingRequirementsFormFields: React.FC<StaffingRequirementsFormFieldsProps> = ({
    formData, handleInputChange, commonInputClasses
}) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Position</label>
                <input type="text" name="personnelPosition" value={formData.personnelPosition} onChange={handleInputChange} required className={commonInputClasses} />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses}>
                    <option value="Permanent">Permanent</option>
                    <option value="Contractual">Contractual</option>
                    <option value="COS">COS</option>
                    <option value="Job Order">Job Order</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Salary Grade</label>
                <input type="number" name="salaryGrade" value={formData.salaryGrade} onChange={handleInputChange} min="1" max="33" className={commonInputClasses} />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Annual Salary + Incentives</label>
                <input type="number" name="annualSalary" value={formData.annualSalary} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Personnel Type</label>
                <select name="personnelType" value={formData.personnelType} onChange={handleInputChange} className={commonInputClasses}>
                    <option value="Technical">Technical</option>
                    <option value="Administrative">Administrative</option>
                    <option value="Support">Support</option>
                </select>
            </div>
        </div>
    );
};
