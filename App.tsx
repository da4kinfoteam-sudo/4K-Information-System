
import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import DashboardsPage from './components/DashboardsPage';
import Subprojects from './components/Subprojects';
import { TrainingsComponent } from './components/Trainings';
import { OtherActivitiesComponent } from './components/OtherActivities';
import IPOs from './components/IPO';
import References, { ReferenceUacs, ReferenceParticular } from './components/References';
import Reports from './components/Reports';
import SubprojectDetail from './components/SubprojectDetail';
import IPODetail from './components/IPODetail';
import Settings from './components/Settings';
import useLocalStorageState from './hooks/useLocalStorageState';
import { 
    initialUacsCodes, initialParticularTypes, Subproject, IPO, Training, OtherActivity,
    sampleIPOs, sampleSubprojects, sampleTrainings, sampleOtherActivities, 
    sampleReferenceUacsList, sampleReferenceParticularList 
} from './constants';

export const App: React.FC = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [currentPage, setCurrentPage] = useState('/');

    // Data States with Sample Defaults
    const [subprojects, setSubprojects] = useLocalStorageState<Subproject[]>('subprojects', sampleSubprojects);
    const [ipos, setIpos] = useLocalStorageState<IPO[]>('ipos', sampleIPOs);
    const [trainings, setTrainings] = useLocalStorageState<Training[]>('trainings', sampleTrainings);
    const [otherActivities, setOtherActivities] = useLocalStorageState<OtherActivity[]>('otherActivities', sampleOtherActivities);
    
    // Reference States with Sample Defaults
    const [referenceUacsList, setReferenceUacsList] = useLocalStorageState<ReferenceUacs[]>('referenceUacsList', sampleReferenceUacsList);
    const [referenceParticularList, setReferenceParticularList] = useLocalStorageState<ReferenceParticular[]>('referenceParticularList', sampleReferenceParticularList);

    // Selection States
    const [selectedSubproject, setSelectedSubproject] = useState<Subproject | null>(null);
    const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);
    const [previousPage, setPreviousPage] = useState('/');

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const toggleDarkMode = () => {
        setIsDarkMode(!isDarkMode);
        document.documentElement.classList.toggle('dark');
    };

    // Initialize dark mode class
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    // Derived References
    const derivedUacsCodes = useMemo(() => {
        const newCodes = JSON.parse(JSON.stringify(initialUacsCodes)); // Deep copy for base structure
        
        // Clear base structure to rely fully on reference list if preferred, 
        // OR merge. Here we merge to ensure user added ones appear.
        // To fully rely on the reference list (which is initialized with the flattened initialUacsCodes),
        // we should reconstruct the tree from scratch.
        
        const tree: { [key: string]: { [key: string]: { [key: string]: string } } } = {};

        referenceUacsList.forEach(item => {
            if (!tree[item.objectType]) tree[item.objectType] = {};
            if (!tree[item.objectType][item.particular]) tree[item.objectType][item.particular] = {};
            tree[item.objectType][item.particular][item.uacsCode] = item.description;
        });
        return tree;
    }, [referenceUacsList]);

    const derivedParticularTypes = useMemo(() => {
        const newTypes: { [key: string]: string[] } = {};
        referenceParticularList.forEach(item => {
            if (!newTypes[item.type]) newTypes[item.type] = [];
            if (!newTypes[item.type].includes(item.particular)) {
                newTypes[item.type].push(item.particular);
            }
        });
        return newTypes;
    }, [referenceParticularList]);


    // Navigation Handlers
    const handleSelectSubproject = (project: Subproject) => {
        setSelectedSubproject(project);
        setPreviousPage(currentPage);
        setCurrentPage('/subproject-detail');
    };

    const handleSelectIpo = (ipo: IPO) => {
        setSelectedIpo(ipo);
        setPreviousPage(currentPage);
        setCurrentPage('/ipo-detail');
    };

    const handleBack = () => {
        setCurrentPage(previousPage);
        setSelectedSubproject(null);
        setSelectedIpo(null);
    };


    const renderPage = () => {
        switch (currentPage) {
            case '/':
                return <Dashboard subprojects={subprojects} ipos={ipos} trainings={trainings} otherActivities={otherActivities} />;
            case '/dashboards':
                 return <DashboardsPage subprojects={subprojects} ipos={ipos} trainings={trainings} otherActivities={otherActivities} />;
            case '/subprojects':
                return <Subprojects 
                            ipos={ipos} 
                            subprojects={subprojects} 
                            setSubprojects={setSubprojects} 
                            onSelectIpo={handleSelectIpo}
                            onSelectSubproject={handleSelectSubproject}
                            uacsCodes={derivedUacsCodes}
                            particularTypes={derivedParticularTypes}
                        />;
            case '/trainings':
                return <TrainingsComponent 
                            ipos={ipos} 
                            trainings={trainings} 
                            setTrainings={setTrainings} 
                            onSelectIpo={handleSelectIpo}
                            uacsCodes={derivedUacsCodes}
                        />;
            case '/other-activities':
                return <OtherActivitiesComponent 
                            ipos={ipos} 
                            otherActivities={otherActivities} 
                            setOtherActivities={setOtherActivities} 
                            onSelectIpo={handleSelectIpo}
                            uacsCodes={derivedUacsCodes}
                        />;
            case '/ipo':
                return <IPOs 
                            ipos={ipos} 
                            setIpos={setIpos} 
                            subprojects={subprojects} 
                            trainings={trainings}
                            onSelectIpo={handleSelectIpo}
                            onSelectSubproject={handleSelectSubproject}
                            particularTypes={derivedParticularTypes}
                        />;
            case '/references':
                return <References 
                            uacsList={referenceUacsList} 
                            setUacsList={setReferenceUacsList}
                            particularList={referenceParticularList}
                            setParticularList={setReferenceParticularList}
                        />;
            case '/reports':
                return <Reports ipos={ipos} subprojects={subprojects} trainings={trainings} otherActivities={otherActivities} />;
            case '/subproject-detail':
                if (!selectedSubproject) return <div>Select a subproject</div>;
                return <SubprojectDetail 
                            subproject={selectedSubproject} 
                            onBack={handleBack} 
                            previousPageName={previousPage === '/' ? 'Dashboard' : previousPage.slice(1)}
                            onUpdateSubproject={(updated) => setSubprojects(prev => prev.map(p => p.id === updated.id ? updated : p))}
                            particularTypes={derivedParticularTypes}
                            uacsCodes={derivedUacsCodes}
                        />;
            case '/ipo-detail':
                if (!selectedIpo) return <div>Select an IPO</div>;
                return <IPODetail 
                            ipo={selectedIpo} 
                            subprojects={subprojects.filter(s => s.indigenousPeopleOrganization === selectedIpo.name)}
                            trainings={trainings.filter(t => t.participatingIpos.includes(selectedIpo.name))}
                            onBack={handleBack}
                            previousPageName={previousPage === '/' ? 'Dashboard' : previousPage.slice(1)}
                            onUpdateIpo={(updated) => setIpos(prev => prev.map(i => i.id === updated.id ? updated : i))}
                            onSelectSubproject={handleSelectSubproject}
                            particularTypes={derivedParticularTypes}
                        />;
            case '/settings':
                return <Settings isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />;
            default:
                return <div className="p-6">Page not found</div>;
        }
    };

    return (
        <div className={`flex h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200 ${isDarkMode ? 'dark' : ''}`}>
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
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-gray-900 p-4 md:p-6">
                    {renderPage()}
                </main>
            </div>
        </div>
    );
};
