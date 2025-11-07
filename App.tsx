import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Subprojects from './components/Subprojects';
import IPOs from './components/IPO';
import TrainingsComponent from './components/Trainings';
import { IPO, Subproject, Training, Activity } from './constants';

const initialIpos: IPO[] = [
    { id: 1, name: 'San Isidro Farmers Association', acronym: 'SIFA', location: 'Brgy. San Isidro, Tanay, Rizal', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Dumagat-Remontado', ancestralDomainNo: 'AD-12345', registeringBody: 'SEC', isWomenLed: true, isWithinGida: false, contactPerson: 'Juan Dela Cruz', contactNumber: '09171234567', registrationDate: '2021-05-20' },
    { id: 2, name: 'Pinugay Upland Farmers Org.', acronym: 'PUFO', location: 'Brgy. Pinugay, Baras, Rizal', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Dumagat', ancestralDomainNo: 'AD-67890', registeringBody: 'DOLE', isWomenLed: false, isWithinGida: true, contactPerson: 'Maria Clara', contactNumber: '09181234567', registrationDate: '2022-03-15' },
    { id: 3, name: 'Macaingalan IP Farmers Assoc.', acronym: 'MIPFA', location: 'Brgy. Macaingalan, General Nakar, Quezon', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Agta', ancestralDomainNo: 'AD-54321', registeringBody: 'CDA', isWomenLed: false, isWithinGida: true, contactPerson: 'Pedro Penduko', contactNumber: '09191234567', registrationDate: '2022-08-10' },
    { id: 4, name: 'Daraitan Farmers Cooperative', acronym: 'DAFACO', location: 'Brgy. Daraitan, Tanay, Rizal', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Dumagat-Remontado', ancestralDomainNo: 'AD-09876', registeringBody: 'National Commission on Indigenous Peoples', isWomenLed: true, isWithinGida: false, contactPerson: 'Gabriela Silang', contactNumber: '09201234567', registrationDate: '2023-01-30' },
];

const initialSubprojects: Subproject[] = [
    { 
        id: 1, 
        name: 'Communal Irrigation System', 
        location: 'Brgy. San Isidro, Tanay, Rizal', 
        indigenousPeopleOrganization: 'San Isidro Farmers Association', 
        status: 'Completed',
        packageType: 'Package 1',
        startDate: '2022-01-15',
        estimatedCompletionDate: '2022-12-31',
        actualCompletionDate: '2022-11-30',
        remarks: 'Completed ahead of schedule. All systems functioning optimally.',
        lat: 14.5333,
        lng: 121.3167,
        details: [
            { id: 1, particulars: 'Cement (40kg bags)', unitOfMeasure: 'pcs', pricePerUnit: 250, numberOfUnits: 10000 },
            { id: 2, particulars: 'Skilled Labor', unitOfMeasure: 'lot', pricePerUnit: 2500000, numberOfUnits: 1 },
        ] 
    },
    { 
        id: 2, 
        name: 'Farm-to-Market Road', 
        location: 'Brgy. Pinugay, Baras, Rizal', 
        indigenousPeopleOrganization: 'Pinugay Upland Farmers Org.', 
        status: 'Ongoing',
        packageType: 'Package 3',
        startDate: '2023-03-01',
        estimatedCompletionDate: '2024-03-01',
        actualCompletionDate: '',
        remarks: 'Slight delay due to weather conditions in Q4 2023.',
        lat: 14.5779,
        lng: 121.2625,
        details: [
            { id: 1, particulars: 'Gravel and Sand', unitOfMeasure: 'lot', pricePerUnit: 3000000, numberOfUnits: 1 },
            { id: 2, particulars: 'Heavy Equipment Rental', unitOfMeasure: 'lot', pricePerUnit: 2000000, numberOfUnits: 1 },
            { id: 3, particulars: 'Project Management', unitOfMeasure: 'lot', pricePerUnit: 2500000, numberOfUnits: 1 },
        ]
    },
     { 
        id: 3, 
        name: 'Coffee Production & Processing', 
        location: 'Sitio Macaingalan, Gen. Nakar, Quezon', 
        indigenousPeopleOrganization: 'Macaingalan IP Farmers Assoc.', 
        status: 'Proposed',
        packageType: 'Package 2',
        startDate: '2024-08-01',
        estimatedCompletionDate: '2025-08-01',
        actualCompletionDate: '',
        remarks: 'Awaiting final approval of budget.',
        lat: 14.7744,
        lng: 121.6315,
        details: [
            { id: 1, particulars: 'Coffee Seedlings', unitOfMeasure: 'pcs', pricePerUnit: 50, numberOfUnits: 50000 },
            { id: 2, particulars: 'Processing Equipment', unitOfMeasure: 'unit', pricePerUnit: 700000, numberOfUnits: 1 },
        ]
    },
    { 
        id: 4, 
        name: 'Water System for Agriculture', 
        location: 'Brgy. Daraitan, Tanay, Rizal', 
        indigenousPeopleOrganization: 'Daraitan Farmers Cooperative', 
        status: 'Ongoing',
        packageType: 'Package 1',
        startDate: '2023-06-20',
        estimatedCompletionDate: '2024-06-20',
        actualCompletionDate: '',
        remarks: 'On track, currently in phase 2 of implementation.',
        lat: 14.6191,
        lng: 121.3653,
        details: [
            { id: 1, particulars: 'Pipes and Fittings', unitOfMeasure: 'lot', pricePerUnit: 2100000, numberOfUnits: 1 },
            { id: 2, particulars: 'Water Pump', unitOfMeasure: 'unit', pricePerUnit: 1000000, numberOfUnits: 1 },
            { id: 3, particulars: 'Installation Labor', unitOfMeasure: 'lot', pricePerUnit: 1000000, numberOfUnits: 1 },
        ]
    },
];

const initialTrainings: Training[] = [
    { id: 1, name: 'Financial Literacy Seminar', date: '2022-02-10', description: 'Basic financial management for farmers.', location: 'Tanay, Rizal', facilitator: 'Rural Bank of Tanay', participatingIpos: ['San Isidro Farmers Association', 'Daraitan Farmers Cooperative'], lat: 14.5986, lng: 121.2885 },
    { id: 2, name: 'Sustainable Farming Practices', date: '2022-07-22', description: 'Workshop on organic farming and soil health.', location: 'Baras, Rizal', facilitator: 'DA-RFO IV-A', participatingIpos: ['Pinugay Upland Farmers Org.'], lat: 14.5308, lng: 121.2721 },
    { id: 3, name: 'Post-Harvest Technology Workshop', date: '2023-04-18', description: 'Training on modern post-harvest techniques to reduce spoilage.', location: 'Gen. Nakar, Quezon', facilitator: 'PhilMech', participatingIpos: ['Macaingalan IP Farmers Assoc.'], lat: 14.7744, lng: 121.6315 },
    { id: 4, name: 'Cooperative Management Training', date: '2023-09-05', description: 'Advanced course on managing a cooperative effectively.', location: 'Tanay, Rizal', facilitator: 'CDA', participatingIpos: ['San Isidro Farmers Association', 'Pinugay Upland Farmers Org.', 'Daraitan Farmers Cooperative'], lat: 14.5986, lng: 121.2885 },
    { id: 5, name: 'Marketing and Linkaging Forum', date: '2024-01-20', description: 'Connecting farmers to potential buyers and markets.', location: 'Online', facilitator: 'DA-AMAS', participatingIpos: ['Macaingalan IP Farmers Assoc.', 'Daraitan Farmers Cooperative'] },
];

const initialActivities: Activity[] = [
    { id: 1, name: 'Community Consultation Meeting', date: '2022-01-15' },
    { id: 2, name: 'Project Site Validation', date: '2022-06-30' },
    { id: 3, name: 'Turnover Ceremony', date: '2023-11-25' },
    { id: 4, name: 'Annual Project Review', date: '2023-12-10' },
];

const App: React.FC = () => {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState('/');
    
    const [ipos, setIpos] = useState<IPO[]>(initialIpos);
    const [subprojects, setSubprojects] = useState<Subproject[]>(initialSubprojects);
    const [trainings, setTrainings] = useState<Training[]>(initialTrainings);
    const [activities, setActivities] = useState<Activity[]>(initialActivities);

    useEffect(() => {
        const isDark = localStorage.getItem('isDarkMode') === 'true';
        setIsDarkMode(isDark);
    }, []);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('isDarkMode', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('isDarkMode', 'false');
        }
    }, [isDarkMode]);

    const toggleDarkMode = () => {
        setIsDarkMode(prev => !prev);
    };

    const toggleSidebar = () => {
        setIsSidebarOpen(prev => !prev);
    };

    const renderPage = () => {
        switch (currentPage) {
            case '/':
                return <Dashboard 
                            subprojects={subprojects}
                            ipos={ipos}
                            trainings={trainings}
                            activities={activities}
                        />;
            case '/subprojects':
                return <Subprojects ipos={ipos} subprojects={subprojects} setSubprojects={setSubprojects} />;
            case '/ipo':
                return <IPOs ipos={ipos} setIpos={setIpos} subprojects={subprojects} trainings={trainings} />;
            case '/trainings':
                return <TrainingsComponent ipos={ipos} trainings={trainings} setTrainings={setTrainings} />;
            default:
                return (
                    <div className="text-center p-10 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Page Coming Soon!</h2>
                        <p className="text-gray-500 dark:text-gray-400 mt-2">This section is under construction.</p>
                    </div>
                );
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
            <Sidebar 
                isOpen={isSidebarOpen} 
                closeSidebar={() => setIsSidebarOpen(false)}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage} 
            />
            
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header 
                    toggleSidebar={toggleSidebar} 
                    toggleDarkMode={toggleDarkMode} 
                    isDarkMode={isDarkMode} 
                />
                <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:p-8">
                    {renderPage()}
                </main>
                <footer className="text-center p-4 text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
                    System maintained by the DA 4K NPMO
                </footer>
            </div>
        </div>
    );
};

export default App;