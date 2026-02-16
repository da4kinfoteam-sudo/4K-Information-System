
// Author: 4K 
import React from 'react';
import { Subproject, IPO } from '../../constants';
import SCADDashboard from '../dashboards/SCADDashboard';
import AgriculturalInterventionsDashboard from '../dashboards/AgriculturalInterventionsDashboard';

interface Props {
    subprojects: Subproject[];
    ipos: IPO[];
}

const CommodityMappingPage: React.FC<Props> = ({ subprojects, ipos }) => {
    return (
        <div className="space-y-8 animate-fadeIn">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Commodity Mapping & Interventions</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Spatial and categorical tracking of agricultural commodities across domains.</p>
            </div>
            
            <section>
                <SCADDashboard ipos={ipos} />
            </section>

            <section>
                <AgriculturalInterventionsDashboard subprojects={subprojects} />
            </section>
        </div>
    );
};

export default CommodityMappingPage;
