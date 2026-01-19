// Author: 4K 
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { IPO, Subproject, Activity, philippineRegions, Commodity, referenceCommodityTypes } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { supabase } from '../supabaseClient';
import { useLogAction } from '../hooks/useLogAction';
import { usePagination, useSelection, getUserPermissions } from './mainfunctions/TableHooks';
import { downloadIposReport, downloadIposTemplate, handleIposUpload } from './mainfunctions/ImportExportService';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface IPOsProps {
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
    subprojects: Subproject[];
    activities: Activity[];
    onSelectIpo: (ipo: IPO) => void;
    onSelectSubproject: (subproject: Subproject) => void;
    particularTypes: { [key: string]: string[] };
    commodityCategories: { [key: string]: string[] };
}

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const defaultFormData = {
    name: '',
    location: '',
    region: '',
    indigenousCulturalCommunity: '',
    ancestralDomainNo: '',
    registeringBody: 'SEC',
    contactPerson: '',
    contactNumber: '',
    registrationDate: '',
    isWomenLed: false,
    isWithinGida: false,
    isWithinElcac: false,
    isWithScad: false,
    commodities: [] as Commodity[],
    levelOfDevelopment: 1 as IPO['levelOfDevelopment'],
    totalMembers: 0,
    totalIpMembers: 0,
    totalMaleMembers: 0,
    totalFemaleMembers: 0,
    totalYouthMembers: 0,
    totalSeniorMembers: 0,
    total4PsMembers: 0,
};

const registeringBodyOptions = ['SEC', 'DOLE', 'CDA'];

const IPOs: React.FC<IPOsProps> = ({ ipos, setIpos, subprojects, activities, onSelectIpo, onSelectSubproject, particularTypes, commodityCategories }) => {
    const { logAction } = useLogAction();
    const [formData, setFormData] = useState(defaultFormData);
    const [otherRegisteringBody, setOtherRegisteringBody] = useState('');
    const [editingIpo, setEditingIpo] = useState<IPO | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [ipoToDelete, setIpoToDelete] = useState<IPO | null>(null);
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Multi-Delete State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isMultiDeleteModalOpen, setIsMultiDeleteModalOpen] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [regionFilter, setRegionFilter] = useState('All');
    const [commodityFilter, setCommodityFilter] = useState('All');
    const [flagFilter, setFlagFilter] = useState({ womenLed: false, withinGida: false, withinElcac: false, withScad: false });
    type SortKeys = keyof IPO | 'totalInvested';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'registrationDate', direction: 'descending' });
    const [view, setView] = useState<'list' | 'add' | 'edit'>('list');

    const [currentCommodity, setCurrentCommodity] = useState({
        type: '',
        particular: '',
        value: '',
        yield: '',
        isScad: false,
    });

    // Helper to refresh data from Supabase
    const refreshData = async () => {
        if (!supabase) return;
        const { data, error } = await supabase.from('ipos').select('*').order('id', { ascending: true });
        if (!error && data) {
            setIpos(data as IPO[]);
        }
    };

    // Calculate derived data from activities
    const calculateTotalInvestment = useMemo(() => {
        const investmentMap = new Map<string, number>();

        // Calculate from subprojects
        subprojects.forEach(sp => {
            if (sp.status === 'Completed') {
                const budget = sp.details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
                const currentInvestment = investmentMap.get(sp.indigenousPeopleOrganization) || 0;
                investmentMap.set(sp.indigenousPeopleOrganization, currentInvestment + budget);
            }
        });

        // Calculate from trainings (filtered from activities)
        activities.filter(a => a.type === 'Training').forEach(t => {
            const cost = t.expenses.reduce((s, e) => s + e.amount, 0);
            t.participatingIpos.forEach(ipoName => {
                const currentInvestment = investmentMap.get(ipoName) || 0;
                investmentMap.set(ipoName, currentInvestment + cost);
            });
        });

        return (ipoName: string) => investmentMap.get(ipoName) || 0;
    }, [subprojects, activities]);

    useEffect(() => {
        if (editingIpo) {
             setFormData({
                name: editingIpo.name,
                location: editingIpo.location,
                region: editingIpo.region,
                indigenousCulturalCommunity: editingIpo.indigenousCulturalCommunity,
                ancestralDomainNo: editingIpo.ancestralDomainNo,
                registeringBody: registeringBodyOptions.includes(editingIpo.registeringBody) ? editingIpo.registeringBody : 'Others',
                contactPerson: editingIpo.contactPerson,
                contactNumber: editingIpo.contactNumber,
                registrationDate: editingIpo.registrationDate || '',
                isWomenLed: editingIpo.isWomenLed,
                isWithinGida: editingIpo.isWithinGida,
                isWithinElcac: editingIpo.isWithinElcac,
                isWithScad: editingIpo.isWithScad,
                commodities: editingIpo.commodities || [],
                levelOfDevelopment: editingIpo.levelOfDevelopment || 1,
                totalMembers: editingIpo.totalMembers || 0,
                totalIpMembers: editingIpo.totalIpMembers || 0,
                totalMaleMembers: editingIpo.totalMaleMembers || 0,
                totalFemaleMembers: editingIpo.totalFemaleMembers || 0,
                totalYouthMembers: editingIpo.totalYouthMembers || 0,
                totalSeniorMembers: editingIpo.totalSeniorMembers || 0,
                total4PsMembers: editingIpo.total4PsMembers || 0,
            });
            if (!registeringBodyOptions.includes(editingIpo.registeringBody)) {
                setOtherRegisteringBody(editingIpo.registeringBody);
            } else {
                setOtherRegisteringBody('');
            }
        } else {
            setFormData(defaultFormData);
        }
    }, [editingIpo]);
    
    const allCommodities = useMemo(() => {
        const commoditySet = new Set<string>();
        ipos.forEach(ipo => {
            ipo.commodities.forEach(c => commoditySet.add(c.particular));
        });
        return Array.from(commoditySet).sort();
    }, [ipos]);

    const processedIpos = useMemo(() => {
        let filteredIpos = [...ipos];

        if (regionFilter !== 'All') {
            filteredIpos = filteredIpos.filter(ipo => ipo.region === regionFilter);
        }
        
        if (flagFilter.womenLed) {
            filteredIpos = filteredIpos.filter(ipo => ipo.isWomenLed);
        }
        if (flagFilter.withinGida) {
            filteredIpos = filteredIpos.filter(ipo => ipo.isWithinGida);
        }
        if (flagFilter.withinElcac) {
            filteredIpos = filteredIpos.filter(ipo => ipo.isWithinElcac);
        }
        if (flagFilter.withScad) {
            filteredIpos = filteredIpos.filter(ipo => ipo.isWithScad);
        }

        if (commodityFilter !== 'All') {
            filteredIpos = filteredIpos.filter(ipo => 
                ipo.commodities.some(c => c.particular === commodityFilter)
            );
        }

        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            filteredIpos = filteredIpos.filter(ipo =>
                ipo.name.toLowerCase().includes(lowercasedSearchTerm) ||
                ipo.contactPerson.toLowerCase().includes(lowercasedSearchTerm) ||
                ipo.location.toLowerCase().includes(lowercasedSearchTerm)
            );
        }

        if (sortConfig !== null) {
            filteredIpos.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                if (sortConfig.key === 'totalInvested') {
                    aValue = calculateTotalInvestment(a.name);
                    bValue = calculateTotalInvestment(b.name);
                } else {
                    aValue = a[sortConfig.key as keyof IPO];
                    bValue = b[sortConfig.key as keyof IPO];
                }
                
                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }

        return filteredIpos;
    }, [ipos, searchTerm, regionFilter, sortConfig, commodityFilter, flagFilter, calculateTotalInvestment]);
    
    // Use Shared Pagination Hook
    const { 
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedIpos 
    } = usePagination(processedIpos, [searchTerm, regionFilter, commodityFilter, flagFilter, sortConfig]);

    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleFlagFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFlagFilter(prev => ({ ...prev, [name]: checked }));
    };

    // --- Multi-Delete Handlers ---
    const handleToggleSelectionMode = () => {
        if (isSelectionMode) {
            setIsSelectionMode(false);
            setSelectedIds([]);
        } else {
            setIsSelectionMode(true);
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const ids = paginatedIpos.map(i => i.id);
            setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
        } else {
            const idsToRemove = new Set(paginatedIpos.map(i => i.id));
            setSelectedIds(prev => prev.filter(id => !idsToRemove.has(id)));
        }
    };

    const handleSelectRow = (id: number) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(i => i !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const confirmMultiDelete = async () => {
        if (supabase) {
            // Log Bulk Delete
            const deletedNames = ipos.filter(i => selectedIds.includes(i.id)).map(i => i.name).join(', ');
            logAction('Deleted IPOs', `Bulk deleted ${selectedIds.length} IPOs: ${deletedNames}`);

            const { error } = await supabase.from('ipos').delete().in('id', selectedIds);
            if (error) {
                console.error("Error deleting IPOs:", error);
                alert("Failed to delete selected IPOs.");
            } else {
                refreshData();
            }
        } else {
            setIpos(prev => prev.filter(ipo => !selectedIds.includes(ipo.id)));
        }
        setIsMultiDeleteModalOpen(false);
        setIsSelectionMode(false);
        setSelectedIds([]);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'levelOfDevelopment' || name.startsWith('total')) {
            setFormData(prev => ({ ...prev, [name]: parseInt(value, 10) || 0 }));
        }
         else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;

        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setCurrentCommodity(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'type') {
            setCurrentCommodity({ type: value, particular: '', value: '', yield: '', isScad: false });
        } else {
            setCurrentCommodity(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddCommodity = () => {
        const isAnimal = currentCommodity.type === 'Animal Commodity';
        if (!currentCommodity.type || !currentCommodity.particular || !currentCommodity.value || (!isAnimal && !currentCommodity.yield)) {
            alert(`Please fill out all commodity fields including ${isAnimal ? 'Number of Heads' : 'Area and Yield'}.`);
            return;
        }
        const newCommodity: Commodity = {
            type: currentCommodity.type,
            particular: currentCommodity.particular,
            value: parseFloat(currentCommodity.value),
            yield: isAnimal ? undefined : parseFloat(currentCommodity.yield),
            isScad: currentCommodity.isScad,
        };

        const updatedCommodities = [...formData.commodities, newCommodity];
        const hasScad = updatedCommodities.some(c => c.isScad);

        setFormData(prev => ({ 
            ...prev, 
            commodities: updatedCommodities,
            isWithScad: hasScad,
        }));
        setCurrentCommodity({ type: '', particular: '', value: '', yield: '', isScad: false });
    };

    const handleRemoveCommodity = (indexToRemove: number) => {
        const updatedCommodities = formData.commodities.filter((_, index) => index !== indexToRemove);
        const hasScad = updatedCommodities.some(c => c.isScad);
        setFormData(prev => ({
            ...prev,
            commodities: updatedCommodities,
            isWithScad: hasScad,
        }));
    };


    const handleLocationChange = (locationString: string) => {
        setFormData(prev => ({
            ...prev,
            location: locationString,
        }));
    };
    
    const handleRegionChange = (region: string) => {
        setFormData(prev => ({
            ...prev,
            region: region
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const finalRegisteringBody = formData.registeringBody === 'Others' ? otherRegisteringBody : formData.registeringBody;
        
        if (!formData.name || !formData.location) {
            alert('Please fill out all required fields: Name and Location.');
            return;
        }
        
        const submissionData = { 
            ...formData, 
            registeringBody: finalRegisteringBody,
            registrationDate: formData.registrationDate || null,
            updated_at: new Date().toISOString()
        };

        if (supabase) {
            try {
                if (editingIpo) {
                    // Log Update
                    logAction('Updated IPO', formData.name);

                    const { error } = await supabase
                        .from('ipos')
                        .update(submissionData)
                        .eq('id', editingIpo.id);
                    if (error) throw error;
                } else {
                    // Log Create
                    logAction('Created IPO', formData.name);

                    // Remove generated fields if creating new
                    const { error } = await supabase
                        .from('ipos')
                        .insert([{ ...submissionData, created_at: new Date().toISOString() }]);
                    if (error) throw error;
                }
                refreshData();
            } catch (error: any) {
                console.error("Error saving IPO:", error);
                alert("Failed to save IPO. " + error.message);
                return;
            }
        } else {
            // Offline fallback
            if (editingIpo) {
                const updatedIpo: IPO = { ...editingIpo, ...submissionData };
                setIpos(prev => prev.map(ipo => ipo.id === editingIpo.id ? updatedIpo : ipo));
            } else {
                const newIpo: IPO = {
                    id: ipos.length > 0 ? Math.max(...ipos.map(ipo => ipo.id)) + 1 : 1,
                    ...submissionData,
                    created_at: new Date().toISOString()
                };
                setIpos(prev => [newIpo, ...prev]);
            }
        }
        handleCancelEdit();
    };

    const handleEditClick = (ipo: IPO, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingIpo(ipo);
        setView('edit');
    };
    
    const handleAddNewClick = () => {
        setEditingIpo(null);
        setView('add');
    };

    const handleCancelEdit = () => {
        setEditingIpo(null);
        setFormData(defaultFormData);
        setOtherRegisteringBody('');
        setCurrentCommodity({ type: '', particular: '', value: '', yield: '', isScad: false });
        setView('list');
    };

    const handleDeleteClick = (ipo: IPO, e: React.MouseEvent) => {
        e.stopPropagation();
        setIpoToDelete(ipo);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (ipoToDelete) {
            // Log Delete
            logAction('Deleted IPO', ipoToDelete.name);

            if (supabase) {
                const { error } = await supabase.from('ipos').delete().eq('id', ipoToDelete.id);
                if (error) {
                    console.error("Error deleting IPO:", error);
                    alert("Failed to delete IPO.");
                } else {
                    refreshData();
                }
            } else {
                setIpos(prev => prev.filter(p => p.id !== ipoToDelete.id));
            }
            setIsDeleteModalOpen(false);
            setIpoToDelete(null);
        }
    };
    
    const formatDate = (dateString?: string | null) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const handleToggleRow = (ipoId: number) => {
        setExpandedRowId(prevId => (prevId === ipoId ? null : ipoId));
    };

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    }
    
    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";
    
    const SortableHeader: React.FC<{ sortKey: SortKeys; label: string; className?: string; }> = ({ sortKey, label, className }) => {
      const isSorted = sortConfig?.key === sortKey;
      const directionIcon = isSorted ? (sortConfig?.direction === 'ascending' ? '▲' : '▼') : '↕';
      return (
        <th scope="col" className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${className}`}>
            <button onClick={() => requestSort(sortKey)} className="flex items-center gap-1.5 group">
              <span>{label}</span>
              <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'}`}>{directionIcon}</span>
            </button>
        </th>
      )
    }

    // Filter activities for display
    const linkedTrainings = useMemo(() => activities.filter(a => a.type === 'Training'), [activities]);

    const renderListView = () => (
        <>
            <div className="flex justify-between items-center mb-6">
                 <h2 className="text-3xl font-bold text-gray-800 dark:text-white">IPO Management</h2>
                 <button
                    onClick={handleAddNewClick}
                    className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
                >
                    + Add New IPO
                </button>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                 <div className="mb-4 flex flex-col gap-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center justify-between">
                        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                            <input
                                type="text"
                                placeholder="Search by name, contact, or location..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className={`w-full md:w-auto ${commonInputClasses} mt-0`}
                            />
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Region:</label>
                                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className={`${commonInputClasses} mt-0`}>
                                    <option value="All">All Regions</option>
                                    {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Commodity:</label>
                                <select value={commodityFilter} onChange={(e) => setCommodityFilter(e.target.value)} className={`${commonInputClasses} mt-0`}>
                                    <option value="All">All Commodities</option>
                                    {allCommodities.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            {isSelectionMode && selectedIds.length > 0 && (
                                <button onClick={() => setIsMultiDeleteModalOpen(true)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700">
                                    Delete Selected ({selectedIds.length})
                                </button>
                            )}
                            <button onClick={() => downloadIposReport(processedIpos)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Download Report</button>
                            <button onClick={downloadIposTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Template</button>
                            <label htmlFor="ipo-upload" className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>{isUploading ? 'Uploading...' : 'Upload'}</label>
                            <input id="ipo-upload" type="file" className="hidden" onChange={(e) => handleIposUpload(e, ipos, setIpos, logAction, setIsUploading)} accept=".xlsx, .xls" disabled={isUploading} />
                            <button
                                onClick={handleToggleSelectionMode}
                                className={`inline-flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 shadow-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 ${isSelectionMode ? 'bg-gray-200 dark:bg-gray-600 text-red-600' : 'bg-white dark:bg-gray-700 text-gray-500'}`}
                                title="Toggle Multi-Delete Mode"
                            >
                                <TrashIcon />
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="womenLed" checked={flagFilter.womenLed} onChange={handleFlagFilterChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                            <span className="text-gray-700 dark:text-gray-300">Women-Led</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="withinGida" checked={flagFilter.withinGida} onChange={handleFlagFilterChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                            <span className="text-gray-700 dark:text-gray-300">Within GIDA</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="withinElcac" checked={flagFilter.withinElcac} onChange={handleFlagFilterChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                            <span className="text-gray-700 dark:text-gray-300">Within ELCAC</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="withScad" checked={flagFilter.withScad} onChange={handleFlagFilterChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                            <span className="text-gray-700 dark:text-gray-300">With SCAD</span>
                        </label>
                    </div>
                 </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="w-12 px-4 py-3 sticky left-0 bg-gray-50 dark:bg-gray-700 z-10"></th>
                                <SortableHeader sortKey="name" label="IPO Name" className="min-w-[200px]" />
                                <SortableHeader sortKey="location" label="Location" />
                                <SortableHeader sortKey="contactPerson" label="Contact" />
                                <SortableHeader sortKey="registrationDate" label="Registered" />
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Flags</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Commodities</th>
                                <SortableHeader sortKey="levelOfDevelopment" label="Level" />
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-700 z-10">
                                    {isSelectionMode ? (
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-xs">Select All</span>
                                            <input 
                                                type="checkbox" 
                                                onChange={handleSelectAll} 
                                                checked={paginatedIpos.length > 0 && paginatedIpos.every(i => selectedIds.includes(i.id))}
                                                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                            />
                                        </div>
                                    ) : "Actions"}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedIpos.map((ipo) => {
                                const relatedSubprojects = subprojects.filter(sp => sp.indigenousPeopleOrganization === ipo.name);
                                const totalInvestment = calculateTotalInvestment(ipo.name);
                                const trainingCount = linkedTrainings.filter(t => t.participatingIpos.includes(ipo.name)).length;

                                return (
                                <React.Fragment key={ipo.id}>
                                    <tr onClick={() => handleToggleRow(ipo.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-4 text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === ipo.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </td>
                                        <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white">
                                            <button onClick={(e) => { e.stopPropagation(); onSelectIpo(ipo); }} className="text-left hover:text-accent hover:underline">
                                                {ipo.name}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{ipo.location}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                            <div>{ipo.contactPerson}</div>
                                            <div className="text-xs text-gray-400">{ipo.contactNumber}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(ipo.registrationDate)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                            <div className="flex flex-wrap gap-1 max-w-[150px]">
                                                {ipo.isWomenLed && <span className="inline-block px-2 py-0.5 text-xs font-medium bg-pink-100 text-pink-800 rounded-full" title="Women-Led">WL</span>}
                                                {ipo.isWithinGida && <span className="inline-block px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 rounded-full" title="GIDA">GIDA</span>}
                                                {ipo.isWithinElcac && <span className="inline-block px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 rounded-full" title="ELCAC">ELCAC</span>}
                                                {ipo.isWithScad && <span className="inline-block px-2 py-0.5 text-xs font-medium bg-cyan-100 text-cyan-800 rounded-full" title="SCAD">SCAD</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300 max-w-[200px]">
                                            {ipo.commodities.map(c => c.particular).join(', ')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 rounded-md mx-auto block w-10">{ipo.levelOfDevelopment}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 z-10">
                                            <div className="flex items-center justify-end">
                                                {isSelectionMode ? (
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.includes(ipo.id)} 
                                                        onChange={(e) => { e.stopPropagation(); handleSelectRow(ipo.id); }} 
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="mr-3 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                    />
                                                ) : (
                                                    <>
                                                        <button onClick={(e) => handleEditClick(ipo, e)} className="text-accent hover:brightness-90 mr-4">Edit</button>
                                                        <button onClick={(e) => handleDeleteClick(ipo, e)} className="text-red-600 hover:text-red-900">Delete</button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedRowId === ipo.id && (
                                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                                            <td colSpan={9} className="p-4">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <div>
                                                        <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-2">IPO Details</h4>
                                                        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                                            <p><strong>ICC:</strong> {ipo.indigenousCulturalCommunity}</p>
                                                            <p><strong>AD No:</strong> {ipo.ancestralDomainNo || 'N/A'}</p>
                                                            <p><strong>Reg. Body:</strong> {ipo.registeringBody}</p>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-2">Engagement Summary</h4>
                                                        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                                            <p><strong>Total Investment:</strong> {formatCurrency(totalInvestment)}</p>
                                                            <p><strong>Subprojects:</strong> {relatedSubprojects.length}</p>
                                                            <p><strong>Trainings Attended:</strong> {trainingCount}</p>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-2">Subprojects</h4>
                                                        {relatedSubprojects.length > 0 ? (
                                                            <ul className="text-xs space-y-1">
                                                                {relatedSubprojects.map(sp => (
                                                                    <li key={sp.id} className="flex justify-between">
                                                                        <span className="truncate max-w-[150px]" title={sp.name}>{sp.name}</span>
                                                                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">{sp.status}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : <p className="text-xs text-gray-500 italic">No subprojects linked.</p>}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )})}
                        </tbody>
                    </table>
                </div>
                 {/* Pagination */}
                 <div className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Show</span>
                        <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm">
                            {[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}
                        </select>
                        <span className="text-gray-700 dark:text-gray-300">entries</span>
                    </div>
                     <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, processedIpos.length)} to {Math.min(currentPage * itemsPerPage, processedIpos.length)} of {processedIpos.length} entries</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                            <span className="px-2 font-medium">{currentPage} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    const renderFormView = () => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">{view === 'edit' ? 'Edit IPO' : 'Add New IPO'}</h3>
                 <button onClick={handleCancelEdit} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Back to List</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
                <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                    <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">IPO Profile</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-3">
                            <label htmlFor="name" className="block text-sm font-medium">IPO Name</label>
                            <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className={commonInputClasses} />
                        </div>
                         <div className="md:col-span-3">
                            <label htmlFor="indigenousCulturalCommunity" className="block text-sm font-medium">Indigenous Cultural Community (ICC)</label>
                            <input type="text" name="indigenousCulturalCommunity" id="indigenousCulturalCommunity" value={formData.indigenousCulturalCommunity} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        
                        <div className="md:col-span-3">
                            <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IPO Location</label>
                            <LocationPicker 
                                value={formData.location} 
                                onChange={handleLocationChange} 
                                onRegionChange={handleRegionChange} 
                                required 
                            />
                        </div>
                        <div className="md:col-span-3">
                            <label htmlFor="ancestralDomainNo" className="block text-sm font-medium">Ancestral Domain No.</label>
                            <input type="text" name="ancestralDomainNo" id="ancestralDomainNo" value={formData.ancestralDomainNo} onChange={handleInputChange} className={commonInputClasses} />
                        </div>

                         <div>
                            <label htmlFor="registeringBody" className="block text-sm font-medium">Registering Body</label>
                            <select name="registeringBody" id="registeringBody" value={formData.registeringBody} onChange={handleInputChange} className={commonInputClasses}>
                                {registeringBodyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                <option value="Others">Others</option>
                            </select>
                         </div>
                         {formData.registeringBody === 'Others' && (
                            <div>
                                <label htmlFor="otherRegisteringBody" className="block text-sm font-medium">Please Specify</label>
                                <input type="text" name="otherRegisteringBody" id="otherRegisteringBody" value={otherRegisteringBody} onChange={(e) => setOtherRegisteringBody(e.target.value)} required className={commonInputClasses} />
                            </div>
                         )}
                          <div className={formData.registeringBody === 'Others' ? '' : 'md:col-start-2'}>
                            <label htmlFor="registrationDate" className="block text-sm font-medium">Registration Date</label>
                            <input type="date" name="registrationDate" id="registrationDate" value={formData.registrationDate} onChange={handleInputChange} className={commonInputClasses} />
                        </div>

                         <div>
                            <label htmlFor="contactPerson" className="block text-sm font-medium">Contact Person</label>
                            <input type="text" name="contactPerson" id="contactPerson" value={formData.contactPerson} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="contactNumber" className="block text-sm font-medium">Contact Number</label>
                            <input type="text" name="contactNumber" id="contactNumber" value={formData.contactNumber} onChange={handleInputChange} className={commonInputClasses} />
                        </div>

                        <div className="md:col-span-3 flex items-center flex-wrap gap-x-8 gap-y-2 pt-2">
                             <label htmlFor="isWomenLed" className="flex items-center gap-2 text-sm font-medium">
                                <input type="checkbox" name="isWomenLed" id="isWomenLed" checked={formData.isWomenLed} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                <span>Women-led</span>
                            </label>
                            <label htmlFor="isWithinGida" className="flex items-center gap-2 text-sm font-medium">
                                <input type="checkbox" name="isWithinGida" id="isWithinGida" checked={formData.isWithinGida} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                <span>Within GIDA area</span>
                            </label>
                            <label htmlFor="isWithinElcac" className="flex items-center gap-2 text-sm font-medium">
                                <input type="checkbox" name="isWithinElcac" id="isWithinElcac" checked={formData.isWithinElcac} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                <span>Within ELCAC area</span>
                            </label>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-400 dark:text-gray-500">
                                <input type="checkbox" name="isWithScad" checked={formData.isWithScad} disabled className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                <span>With SCAD</span>
                            </label>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                    <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Commodities</legend>
                    <div className="space-y-2 mb-4">
                        {formData.commodities.map((commodity, index) => (
                            <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">{commodity.particular}</span>
                                    <span className="text-gray-500 dark:text-gray-400"> ({commodity.type}) - </span>
                                    <span>
                                        {commodity.value.toLocaleString()} {commodity.type === 'Animal Commodity' ? 'heads' : 'ha'}
                                        {commodity.yield ? ` | Yield: ${commodity.yield}` : ''}
                                    </span>
                                    {commodity.isScad && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800">SCAD</span>}
                                </div>
                                <button type="button" onClick={() => handleRemoveCommodity(index)} className="text-gray-400 hover:text-red-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                         <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Type</label>
                            <select name="type" value={currentCommodity.type} onChange={handleCommodityChange} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm">
                                <option value="">Select Type</option>
                                {referenceCommodityTypes.map(type => ( <option key={type} value={type}>{type}</option> ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Particular</label>
                            <select name="particular" value={currentCommodity.particular} onChange={handleCommodityChange} disabled={!currentCommodity.type} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm disabled:bg-gray-200 dark:disabled:bg-gray-600">
                                <option value="">Select Particular</option>
                                {currentCommodity.type && commodityCategories[currentCommodity.type] && commodityCategories[currentCommodity.type].map(item => ( <option key={item} value={item}>{item}</option> ))}
                            </select>
                        </div>
                         <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{currentCommodity.type === 'Animal Commodity' ? 'Number of Heads' : 'Area (ha)'}</label>
                                <input type="number" name="value" value={currentCommodity.value} onChange={handleCommodityChange} min="0" step="any" className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
                            </div>
                            {currentCommodity.type !== 'Animal Commodity' && (
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Avg Yield</label>
                                    <input type="number" name="yield" value={currentCommodity.yield} onChange={handleCommodityChange} min="0" step="any" className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
                                </div>
                            )}
                            <button type="button" onClick={handleAddCommodity} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50 text-accent dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900">+</button>
                        </div>
                    </div>
                    <div className="mt-2">
                        <label className="flex items-center gap-2 text-sm font-medium">
                            <input type="checkbox" name="isScad" checked={currentCommodity.isScad} onChange={handleCommodityChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                            <span>SCAD commodity</span>
                        </label>
                    </div>
                </fieldset>
                
                <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                    <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Level of Development</legend>
                    <div>
                        <label htmlFor="levelOfDevelopment" className="block text-sm font-medium">Current Level</label>
                        <select name="levelOfDevelopment" id="levelOfDevelopment" value={formData.levelOfDevelopment} onChange={handleInputChange} required className={commonInputClasses}>
                            <option value={1}>Level 1</option> <option value={2}>Level 2</option> <option value={3}>Level 3</option> <option value={4}>Level 4</option> <option value={5}>Level 5</option>
                        </select>
                    </div>
                </fieldset>

                <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                    <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Membership Information</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="totalMembers" className="block text-sm font-medium">Total Members</label>
                            <input type="number" name="totalMembers" id="totalMembers" value={formData.totalMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="totalIpMembers" className="block text-sm font-medium">Total IP Members</label>
                            <input type="number" name="totalIpMembers" id="totalIpMembers" value={formData.totalIpMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="total4PsMembers" className="block text-sm font-medium">Total 4Ps Beneficiaries</label>
                            <input type="number" name="total4PsMembers" id="total4PsMembers" value={formData.total4PsMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="totalMaleMembers" className="block text-sm font-medium">Male Members</label>
                            <input type="number" name="totalMaleMembers" id="totalMaleMembers" value={formData.totalMaleMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="totalFemaleMembers" className="block text-sm font-medium">Female Members</label>
                            <input type="number" name="totalFemaleMembers" id="totalFemaleMembers" value={formData.totalFemaleMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">&nbsp;</label>
                            <span className="text-sm text-gray-500">Total: {(formData.totalMaleMembers || 0) + (formData.totalFemaleMembers || 0)}</span>
                        </div>
                        <div>
                            <label htmlFor="totalYouthMembers" className="block text-sm font-medium">Youth Members</label>
                            <input type="number" name="totalYouthMembers" id="totalYouthMembers" value={formData.totalYouthMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="totalSeniorMembers" className="block text-sm font-medium">Senior Citizen Members</label>
                            <input type="number" name="totalSeniorMembers" id="totalSeniorMembers" value={formData.totalSeniorMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                    </div>
                </fieldset>

                <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" onClick={handleCancelEdit} className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                        Cancel
                    </button>
                    <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    );

    return (
        <div>
            {/* Delete Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Confirm Deletion</h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-6">Are you sure you want to delete <strong>{ipoToDelete?.name}</strong>? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Multi-Delete Modal */}
            {isMultiDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Confirm Bulk Deletion</h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-6">Are you sure you want to delete {selectedIds.length} selected IPOs? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm">Cancel</button>
                            <button onClick={confirmMultiDelete} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">Delete All</button>
                        </div>
                    </div>
                </div>
            )}

            {view === 'list' ? renderListView() : renderFormView()}
        </div>
    );
};

export default IPOs;