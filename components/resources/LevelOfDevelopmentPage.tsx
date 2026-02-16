
// Author: 4K 
import React from 'react';
import { IPO } from '../../constants';
import IPOLevelDashboard from '../dashboards/IPOLevelDashboard';

interface Props {
    ipos: IPO[];
}

const LevelOfDevelopmentPage: React.FC<Props> = ({ ipos }) => {
    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Level of Development Registry</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Comprehensive overview of IPO maturity levels and growth metrics.</p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <IPOLevelDashboard ipos={ipos} />
            </div>
        </div>
    );
};

export default LevelOfDevelopmentPage;
