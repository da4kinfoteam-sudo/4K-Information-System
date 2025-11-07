
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Subprojects from './components/Subprojects';
import IPOs from './components/IPO';
import IPODetail from './components/IPODetail';
import TrainingsComponent from './components/Trainings';
import { IPO, Subproject, Training, Activity } from './constants';

const initialIpos: IPO[] = [
    { id: 1, name: 'San Isidro Farmers Association', acronym: 'SIFA', location: 'Brgy. San Isidro, Tanay, Rizal', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Dumagat-Remontado', ancestralDomainNo: 'AD-12345', registeringBody: 'SEC', isWomenLed: true, isWithinGida: false, contactPerson: 'Juan Dela Cruz', contactNumber: '09171234567', registrationDate: '2021-05-20', commodities: [{ type: 'Crop Commodity', particular: 'Rice Seeds', value: 50 }], levelOfDevelopment: 3 },
    { id: 2, name: 'Pinugay Upland Farmers Org.', acronym: 'PUFO', location: 'Brgy. Pinugay, Baras, Rizal', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Dumagat', ancestralDomainNo: 'AD-67890', registeringBody: 'DOLE', isWomenLed: false, isWithinGida: true, contactPerson: 'Maria Clara', contactNumber: '09181234567', registrationDate: '2022-03-15', commodities: [{ type: 'Livestock', particular: 'Goats', value: 100 }], levelOfDevelopment: 2 },
    { id: 3, name: 'Macaingalan IP Farmers Assoc.', acronym: 'MIPFA', location: 'Brgy. Macaingalan, General Nakar, Quezon', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Agta', ancestralDomainNo: 'AD-54321', registeringBody: 'CDA', isWomenLed: false, isWithinGida: true, contactPerson: 'Pedro Penduko', contactNumber: '09191234567', registrationDate: '2022-08-10', commodities: [{ type: 'Crop Commodity', particular: 'Coffee Seedlings', value: 15 }], levelOfDevelopment: 1 },
    { id: 4, name: 'Daraitan Farmers Cooperative', acronym: 'DAFACO', location: 'Brgy. Daraitan, Tanay, Rizal', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Dumagat-Remontado', ancestralDomainNo: 'AD-09876', registeringBody: 'National Commission on Indigenous Peoples', isWomenLed: true, isWithinGida: false, contactPerson: 'Gabriela Silang', contactNumber: '09201234567', registrationDate: '2023-01-30', commodities: [], levelOfDevelopment: 1 },
    { id: 5, name: 'Marilog District Coffee Growers Association', acronym: 'MDCGA', location: 'Brgy. Marilog, Davao City, Davao del Sur', region: 'Davao Region (Region XI)', indigenousCulturalCommunity: 'Bagobo Tagabawa', ancestralDomainNo: 'AD-DVO-1101', registeringBody: 'CDA', isWomenLed: true, isWithinGida: true, contactPerson: 'Bae Liza Saway', contactNumber: '09172345678', registrationDate: '2022-04-12', commodities: [{ type: 'Crop Commodity', particular: 'Coffee Seedlings', value: 100 }], levelOfDevelopment: 4 },
    { id: 6, name: 'Malita Cacao Farmers Cooperative', acronym: 'MCFC', location: 'Brgy. Buhangin, Malita, Davao Occidental', region: 'Davao Region (Region XI)', indigenousCulturalCommunity: 'Blaan', ancestralDomainNo: 'AD-DVO-1102', registeringBody: 'CDA', isWomenLed: false, isWithinGida: true, contactPerson: 'Datu Isidro Inda', contactNumber: '09182345678', registrationDate: '2021-11-20', commodities: [], levelOfDevelopment: 2 },
    { id: 7, name: 'New Bataan Banana Growers Association', acronym: 'NBGA', location: 'Brgy. Camanlangan, New Bataan, Davao de Oro', region: 'Davao Region (Region XI)', indigenousCulturalCommunity: 'Mansaka', ancestralDomainNo: 'AD-DVO-1103', registeringBody: 'DOLE', isWomenLed: false, isWithinGida: false, contactPerson: 'Mario Agpawa', contactNumber: '09202345678', registrationDate: '2023-02-28', commodities: [], levelOfDevelopment: 1 },
    { id: 8, name: 'Samal Island Seaweeds Planters Org.', acronym: 'SISPO', location: 'Brgy. Adecor, Island Garden City of Samal, Davao del Norte', region: 'Davao Region (Region XI)', indigenousCulturalCommunity: 'Sama', ancestralDomainNo: 'AD-DVO-1104', registeringBody: 'SEC', isWomenLed: true, isWithinGida: false, contactPerson: 'Fatima M. Santos', contactNumber: '09212345678', registrationDate: '2022-09-05', commodities: [], levelOfDevelopment: 1 },
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
            { id: 1, type: 'Infrastructure', particulars: 'Cement', deliveryDate: '2022-02-01', unitOfMeasure: 'pcs', pricePerUnit: 250, numberOfUnits: 10000 },
            { id: 2, type: 'Infrastructure', particulars: 'Skilled Labor', deliveryDate: '2022-03-01', unitOfMeasure: 'lot', pricePerUnit: 2500000, numberOfUnits: 1 },
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
            { id: 1, type: 'Infrastructure', particulars: 'Gravel and Sand', deliveryDate: '2023-03-15', unitOfMeasure: 'lot', pricePerUnit: 3000000, numberOfUnits: 1 },
            { id: 2, type: 'Others', particulars: 'Heavy Equipment Rental', deliveryDate: '2023-03-20', unitOfMeasure: 'lot', pricePerUnit: 2000000, numberOfUnits: 1 },
            { id: 3, type: 'Others', particulars: 'Project Management', deliveryDate: '2023-03-01', unitOfMeasure: 'lot', pricePerUnit: 2500000, numberOfUnits: 1 },
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
            { id: 1, type: 'Crop Commodity', particulars: 'Coffee Seedlings', deliveryDate: '2024-08-15', unitOfMeasure: 'pcs', pricePerUnit: 50, numberOfUnits: 50000 },
            { id: 2, type: 'Equipment', particulars: 'Processing Equipment', deliveryDate: '2024-09-01', unitOfMeasure: 'unit', pricePerUnit: 700000, numberOfUnits: 1 },
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
            { id: 1, type: 'Infrastructure', particulars: 'Pipes and Fittings', deliveryDate: '2023-07-01', unitOfMeasure: 'lot', pricePerUnit: 2100000, numberOfUnits: 1 },
            { id: 2, type: 'Equipment', particulars: 'Water Pump', deliveryDate: '2023-07-05', unitOfMeasure: 'unit', pricePerUnit: 1000000, numberOfUnits: 1 },
            { id: 3, type: 'Infrastructure', particulars: 'Installation Labor', deliveryDate: '2023-07-10', unitOfMeasure: 'lot', pricePerUnit: 1000000, numberOfUnits: 1 },
        ]
    },
    { 
        id: 5, 
        name: 'Arabica Coffee Processing Facility', 
        location: 'Brgy. Marilog, Davao City, Davao del Sur', 
        indigenousPeopleOrganization: 'Marilog District Coffee Growers Association', 
        status: 'Ongoing',
        packageType: 'Package 2',
        startDate: '2023-05-10',
        estimatedCompletionDate: '2024-05-10',
        actualCompletionDate: '',
        remarks: 'Construction of processing building is 50% complete.',
        lat: 7.5139,
        lng: 125.2672,
        details: [
            { id: 1, type: 'Equipment', particulars: 'Processing Equipment', deliveryDate: '2023-08-01', unitOfMeasure: 'unit', pricePerUnit: 350000, numberOfUnits: 2 },
            { id: 2, type: 'Infrastructure', particulars: 'Processing Shed', deliveryDate: '2023-05-20', unitOfMeasure: 'lot', pricePerUnit: 1200000, numberOfUnits: 1 },
        ] 
    },
    { 
        id: 6, 
        name: 'Cacao Fermentation and Drying Facility', 
        location: 'Brgy. Buhangin, Malita, Davao Occidental', 
        indigenousPeopleOrganization: 'Malita Cacao Farmers Cooperative', 
        status: 'Completed',
        packageType: 'Package 2',
        startDate: '2022-01-20',
        estimatedCompletionDate: '2022-10-31',
        actualCompletionDate: '2022-09-15',
        remarks: 'Turned over to the IPO and is now fully operational.',
        lat: 6.4039,
        lng: 125.6111,
        details: [
            { id: 1, type: 'Equipment', particulars: 'Processing Equipment', deliveryDate: '2022-03-01', unitOfMeasure: 'unit', pricePerUnit: 500000, numberOfUnits: 1 },
            { id: 2, type: 'Infrastructure', particulars: 'Warehouse', deliveryDate: '2022-02-01', unitOfMeasure: 'lot', pricePerUnit: 800000, numberOfUnits: 1 },
        ]
    },
    { 
        id: 7, 
        name: 'Rehabilitation of Banana Farm-to-Market Road', 
        location: 'Brgy. Camanlangan, New Bataan, Davao de Oro', 
        indigenousPeopleOrganization: 'New Bataan Banana Growers Association', 
        status: 'Proposed',
        packageType: 'Package 3',
        startDate: '2024-09-01',
        estimatedCompletionDate: '2025-09-01',
        actualCompletionDate: '',
        remarks: 'For validation and approval by the regional office.',
        lat: 7.5303,
        lng: 126.1558,
        details: [
            { id: 1, type: 'Infrastructure', particulars: 'Gravel and Sand', deliveryDate: '2024-09-15', unitOfMeasure: 'lot', pricePerUnit: 4000000, numberOfUnits: 1 },
            { id: 2, type: 'Others', particulars: 'Heavy Equipment Rental', deliveryDate: '2024-09-20', unitOfMeasure: 'lot', pricePerUnit: 2500000, numberOfUnits: 1 },
        ]
    },
    { 
        id: 8, 
        name: 'Seaweed Nursery and Post-Harvest Facility', 
        location: 'Brgy. Adecor, Island Garden City of Samal, Davao del Norte', 
        indigenousPeopleOrganization: 'Samal Island Seaweeds Planters Org.', 
        status: 'Ongoing',
        packageType: 'Package 1',
        startDate: '2023-07-01',
        estimatedCompletionDate: '2024-07-01',
        actualCompletionDate: '',
        remarks: 'Nursery establishment complete. Awaiting materials for drying facility.',
        lat: 7.0781,
        lng: 125.7197,
        details: [
            { id: 1, type: 'Equipment', particulars: 'Floating cages', deliveryDate: '2023-07-15', unitOfMeasure: 'unit', pricePerUnit: 10000, numberOfUnits: 50 },
            { id: 2, type: 'Infrastructure', particulars: 'Storage unit', deliveryDate: '2023-08-01', unitOfMeasure: 'lot', pricePerUnit: 300000, numberOfUnits: 1 },
        ]
    },
];

const initialTrainings: Training[] = [
    { id: 1, name: 'Financial Literacy Seminar', date: '2022-02-10', description: 'Basic financial management for farmers.', location: 'Tanay, Rizal', facilitator: 'Rural Bank of Tanay', participatingIpos: ['San Isidro Farmers Association', 'Daraitan Farmers Cooperative'], lat: 14.5986, lng: 121.2885, participantsMale: 15, participantsFemale: 25, trainingExpenses: 50000, component: 'Social Preparation' },
    { id: 2, name: 'Sustainable Farming Practices', date: '2022-07-22', description: 'Workshop on organic farming and soil health.', location: 'Baras, Rizal', facilitator: 'DA-RFO IV-A', participatingIpos: ['Pinugay Upland Farmers Org.'], lat: 14.5308, lng: 121.2721, participantsMale: 30, participantsFemale: 10, trainingExpenses: 75000, component: 'Production and Livelihood' },
    { id: 3, name: 'Post-Harvest Technology Workshop', date: '2023-04-18', description: 'Training on modern post-harvest techniques to reduce spoilage.', location: 'Gen. Nakar, Quezon', facilitator: 'PhilMech', participatingIpos: ['Macaingalan IP Farmers Assoc.'], lat: 14.7744, lng: 121.6315, participantsMale: 22, participantsFemale: 18, trainingExpenses: 120000, component: 'Production and Livelihood' },
    { id: 4, name: 'Cooperative Management Training', date: '2023-09-05', description: 'Advanced course on managing a cooperative effectively.', location: 'Tanay, Rizal', facilitator: 'CDA', participatingIpos: ['San Isidro Farmers Association', 'Pinugay Upland Farmers Org.', 'Daraitan Farmers Cooperative'], lat: 14.5986, lng: 121.2885, participantsMale: 40, participantsFemale: 35, trainingExpenses: 85000, component: 'Program Management' },
    { id: 5, name: 'Marketing and Linkaging Forum', date: '2024-01-20', description: 'Connecting farmers to potential buyers and markets.', location: 'Online', facilitator: 'DA-AMAS', participatingIpos: ['Macaingalan IP Farmers Assoc.', 'Daraitan Farmers Cooperative'], participantsMale: 18, participantsFemale: 22, trainingExpenses: 25000, component: 'Marketing and Enterprise' },
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
    const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);
    const [previousPage, setPreviousPage] = useState<string | null>(null);
    
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
    
    const handleNavigation = (page: string) => {
        setSelectedIpo(null);
        setPreviousPage(null);
        setCurrentPage(page);
    };
    
    const handleSelectIpo = (ipo: IPO) => {
        setPreviousPage(currentPage);
        setSelectedIpo(ipo);
    };

    const handleBackFromIpoDetail = () => {
        setSelectedIpo(null);
        if (previousPage) {
            setCurrentPage(previousPage);
        } else {
            setCurrentPage('/ipo'); // Fallback
        }
        setPreviousPage(null);
    };

    const getPageName = (path: string | null): string => {
        switch(path) {
            case '/subprojects': return 'Subprojects';
            case '/trainings': return 'Trainings';
            case '/ipo': return 'IPO List';
            default: return 'IPO List';
        }
    }

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
                return <Subprojects ipos={ipos} subprojects={subprojects} setSubprojects={setSubprojects} onSelectIpo={handleSelectIpo} />;
            case '/ipo':
                return <IPOs 
                    ipos={ipos} 
                    setIpos={setIpos} 
                    subprojects={subprojects} 
                    trainings={trainings} 
                    onSelectIpo={handleSelectIpo} 
                />;
            case '/trainings':
                return <TrainingsComponent ipos={ipos} trainings={trainings} setTrainings={setTrainings} onSelectIpo={handleSelectIpo} />;
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
                setCurrentPage={handleNavigation} 
            />
            
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header 
                    toggleSidebar={toggleSidebar} 
                    toggleDarkMode={toggleDarkMode} 
                    isDarkMode={isDarkMode} 
                />
                <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:p-8">
                    {selectedIpo ? (
                        <IPODetail 
                            ipo={selectedIpo}
                            subprojects={subprojects.filter(p => p.indigenousPeopleOrganization === selectedIpo.name)}
                            trainings={trainings.filter(t => t.participatingIpos.includes(selectedIpo.name))}
                            onBack={handleBackFromIpoDetail}
                            previousPageName={getPageName(previousPage)}
                        />
                    ) : (
                        renderPage()
                    )}
                </main>
                <footer className="text-center p-4 text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
                    System maintained by the DA 4K NPMO
                </footer>
            </div>
        </div>
    );
};

export default App;
