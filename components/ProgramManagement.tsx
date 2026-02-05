// Author: 4K 
import React from 'react';
import { 
    OfficeRequirement, StaffingRequirement, OtherProgramExpense
} from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { getUserPermissions } from './mainfunctions/TableHooks';
import { OfficeRequirementsTab } from './program_management/OfficeRequirementsTab';
import { StaffingRequirementsTab } from './program_management/StaffingRequirementsTab';
import { OtherExpensesTab } from './program_management/OtherExpensesTab';
import useLocalStorageState from '../hooks/useLocalStorageState';

interface ProgramManagementProps {
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    otherProgramExpenses: OtherProgramExpense[];
    setOtherProgramExpenses: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelectOfficeReq: (item: OfficeRequirement) => void;
    onSelectStaffingReq: (item: StaffingRequirement) => void;
    onSelectOtherExpense: (item: OtherProgramExpense) => void;
}

type ActiveTab = 'Office' | 'Staffing' | 'Other';

const ProgramManagement: React.FC<ProgramManagementProps> = ({ 
    officeReqs, setOfficeReqs, 
    staffingReqs, setStaffingReqs, 
    otherProgramExpenses, setOtherProgramExpenses,
    uacsCodes,
    onSelectOfficeReq,
    onSelectStaffingReq,
    onSelectOtherExpense
}) => {
    const { currentUser } = useAuth();
    // Use local storage state for persistence
    const [activeTab, setActiveTab] = useLocalStorageState<ActiveTab>('programManagement_activeTab', 'Office');
    const { canEdit } = getUserPermissions(currentUser);

    const TabButton = ({ name, label }: { name: ActiveTab; label: string }) => {
        const isActive = activeTab === name;
        return (
            <button
                onClick={() => setActiveTab(name)}
                className={`${
                    isActive 
                        ? 'border-emerald-600 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-400' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800'
                } whitespace-nowrap py-3 px-6 border-b-2 font-medium text-sm transition-colors duration-200 rounded-t-md`}
            >
                {label}
            </button>
        );
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Program Management</h2>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                <nav className="-mb-px flex space-x-2" aria-label="Tabs">
                    <TabButton name="Office" label="Office Requirements" />
                    <TabButton name="Staffing" label="Staffing Requirements" />
                    <TabButton name="Other" label="Other Expenses" />
                </nav>
            </div>

            <div className="animate-fadeIn">
                {activeTab === 'Office' && (
                    <OfficeRequirementsTab 
                        items={officeReqs} 
                        setItems={setOfficeReqs}
                        uacsCodes={uacsCodes}
                        onSelect={onSelectOfficeReq}
                    />
                )}
                {activeTab === 'Staffing' && (
                    <StaffingRequirementsTab 
                        items={staffingReqs} 
                        setItems={setStaffingReqs}
                        uacsCodes={uacsCodes}
                        onSelect={onSelectStaffingReq}
                    />
                )}
                {activeTab === 'Other' && (
                    <OtherExpensesTab 
                        items={otherProgramExpenses} 
                        setItems={setOtherProgramExpenses}
                        uacsCodes={uacsCodes}
                        onSelect={onSelectOtherExpense}
                    />
                )}
            </div>
        </div>
    );
};

export default ProgramManagement;