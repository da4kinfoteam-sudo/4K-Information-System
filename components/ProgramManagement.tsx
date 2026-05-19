// Author: 4K 
import React from 'react';
import { 
    OfficeRequirement, StaffingRequirement, OtherProgramExpense
} from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccess } from './mainfunctions/TableHooks';
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
    const { canEdit } = useUserAccess('Program Management');

    const TabButton = ({ name, label }: { name: ActiveTab; label: string }) => {
        const isActive = activeTab === name;
        return (
            <button onClick={() => setActiveTab(name)} className={`data-tab ${isActive ? 'is-active' : ''}`}>
                {label}
            </button>
        );
    };

    return (
        <div className="data-list-page">
            <div className="data-list-header">
                <h2 className="data-list-title">Program Management</h2>
            </div>

            <div className="data-tabs">
                <nav className="flex gap-1" aria-label="Tabs">
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
