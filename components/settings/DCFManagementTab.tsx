// Author: 4K
import React, { useState } from 'react';
import { 
    Subproject, Activity, OfficeRequirement, StaffingRequirement, OtherProgramExpense
} from '../../constants';
import PhysicalStatusManagement from './PhysicalStatusManagement';
import BudgetCeilingManagement from './BudgetCeilingManagement';

interface DCFManagementTabProps {
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    otherProgramExpenses: OtherProgramExpense[];
    setOtherProgramExpenses: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    onSelectSubproject: (project: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
}

const DCFManagementTab: React.FC<DCFManagementTabProps> = (props) => {
    const [activeSection, setActiveSection] = useState<'physical' | 'budget'>('physical');

    return (
        <div className="space-y-6">
            <div className="flex space-x-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                <button
                    onClick={() => setActiveSection('physical')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                        activeSection === 'physical'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-b-2 border-emerald-500'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                >
                    Physical Status Management
                </button>
                <button
                    onClick={() => setActiveSection('budget')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                        activeSection === 'budget'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-b-2 border-emerald-500'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                >
                    Budget Ceiling Management
                </button>
            </div>

            {activeSection === 'physical' ? (
                <PhysicalStatusManagement {...props} />
            ) : (
                <BudgetCeilingManagement 
                    subprojects={props.subprojects}
                    activities={props.activities}
                    officeReqs={props.officeReqs}
                    staffingReqs={props.staffingReqs}
                    otherProgramExpenses={props.otherProgramExpenses}
                />
            )}
        </div>
    );
};

export default DCFManagementTab;
