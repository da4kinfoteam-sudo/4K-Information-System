
// Author: 4K 
import React, { useState } from 'react';
import { 
    OfficeRequirement, StaffingRequirement, OtherProgramExpense
} from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { getUserPermissions } from './mainfunctions/TableHooks';
import { OfficeRequirementsTab } from './program_management/OfficeRequirementsTab';
import { StaffingRequirementsTab } from './program_management/StaffingRequirementsTab';
import { OtherExpensesTab } from './program_management/OtherExpensesTab';

interface ProgramManagementProps {
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    otherProgramExpenses: OtherProgramExpense[];
    setOtherProgramExpenses: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
}

type ActiveTab = 'Office' | 'Staffing' | 'Other';

const ProgramManagement: React.FC<ProgramManagementProps> = ({ 
    officeReqs, setOfficeReqs, 
    staffingReqs, setStaffingReqs, 
    otherProgramExpenses, setOtherProgramExpenses,
    uacsCodes
}) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<ActiveTab>('Office');
    const { canEdit } = getUserPermissions(currentUser);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Program Management</h2>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('Office')}
                        className={`${activeTab === 'Office' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        Office Requirements
                    </button>
                    <button
                        onClick={() => setActiveTab('Staffing')}
                        className={`${activeTab === 'Staffing' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        Staffing Requirements
                    </button>
                    <button
                        onClick={() => setActiveTab('Other')}
                        className={`${activeTab === 'Other' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        Other Expenses
                    </button>
                </nav>
            </div>

            {activeTab === 'Office' && (
                <OfficeRequirementsTab 
                    items={officeReqs} 
                    setItems={setOfficeReqs}
                    uacsCodes={uacsCodes}
                />
            )}
            {activeTab === 'Staffing' && (
                <StaffingRequirementsTab 
                    items={staffingReqs} 
                    setItems={setStaffingReqs}
                    uacsCodes={uacsCodes}
                />
            )}
            {activeTab === 'Other' && (
                <OtherExpensesTab 
                    items={otherProgramExpenses} 
                    setItems={setOtherProgramExpenses}
                    uacsCodes={uacsCodes}
                />
            )}
        </div>
    );
};

export default ProgramManagement;
