
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { objectTypes, referenceCommodityTypes, GidaArea, ElcacArea, normalizeRegionName, IPO, RefCommodity } from '../constants';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { parseLocation } from './LocationPicker';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

// Data Structures matching the flattened state
export interface ReferenceUacs {
    id: string;
    objectType: string;
    particular: string;
    uacsCode: string;
    description: string;
}

export interface ReferenceParticular {
    id: string;
    type: string;
    particular: string;
}

export interface ReferenceCommodity {
    id: string;
    type: string;
    particular: string;
}

interface ReferencesProps {
    uacsList: ReferenceUacs[];
    setUacsList: React.Dispatch<React.SetStateAction<ReferenceUacs[]>>;
    particularList: ReferenceParticular[];
    setParticularList: React.Dispatch<React.SetStateAction<ReferenceParticular[]>>;
    commodityList: ReferenceCommodity[];
    setCommodityList: React.Dispatch<React.SetStateAction<ReferenceCommodity[]>>;
    refCommodities: RefCommodity[];
    setRefCommodities: React.Dispatch<React.SetStateAction<RefCommodity[]>>;
    gidaList: GidaArea[];
    setGidaList: React.Dispatch<React.SetStateAction<GidaArea[]>>;
    elcacList: ElcacArea[];
    setElcacList: React.Dispatch<React.SetStateAction<ElcacArea[]>>;
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
}

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const References: React.FC<ReferencesProps> = ({ uacsList, setUacsList, particularList, setParticularList, commodityList, setCommodityList, refCommodities, setRefCommodities, gidaList, setGidaList, elcacList, setElcacList, ipos, setIpos }) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'UACS' | 'Items' | 'Commodities' | 'Crop References' | 'GIDA' | 'ELCAC'>('UACS');
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [deleteItem, setDeleteItem] = useState<any>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Sorting State
    type SortConfig = { key: string; direction: 'ascending' | 'descending' } | null;
    const [sortConfig, setSortConfig] = useState<SortConfig>(null);

    // Multi-Delete State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isMultiDeleteModalOpen, setIsMultiDeleteModalOpen] = useState(false);

    // Access Control: User role is Read-Only
    const canEdit = currentUser?.role !== 'User';

    // --- UACS Form State ---
    const [uacsForm, setUacsForm] = useState({
        objectType: 'MOOE',
        particular: '',
        uacsCode: '',
        description: ''
    });

    // --- Items Form State ---
    const [itemForm, setItemForm] = useState({
        type: '',
        particular: ''
    });

    // --- Commodities Form State ---
    const [commodityForm, setCommodityForm] = useState({
        type: 'Crop Commodity',
        particular: ''
    });

    // --- Crop References Form State ---
    const [refCommodityForm, setRefCommodityForm] = useState({
        name: '',
        banner_program: '',
        commodity_group: '',
        min_elevation_masl: 0,
        max_elevation_masl: 0,
        max_slope_percent: 0,
        wet_season_start: '',
        dry_season_start: '',
        recommended_soil: '',
        fertilizer_npk: '',
        watering_method: '',
        harvest_period_days: 0,
        ph_min: 0,
        ph_max: 0,
        climate_type_suitability: '',
        target_yield_ha: 0
    });

    // --- GIDA Form State ---
    const [gidaForm, setGidaForm] = useState({
        region: '',
        province: '',
        municipality: '',
        barangay: ''
    });

    // --- ELCAC Form State ---
    const [elcacForm, setElcacForm] = useState({
        region: '',
        province: '',
        municipality: '',
        barangay: ''
    });

    const handleRetroactiveGidaUpdate = async () => {
        if (!supabase) return;
        if (!window.confirm("This will check all IPOs and update their 'Within GIDA Areas' status based on the current GIDA list. Continue?")) return;

        setIsUploading(true);
        try {
            const updates = ipos.map(ipo => {
                const { province, municipality, barangays } = parseLocation(ipo.location);
                const isWithinGida = gidaList.some(g => 
                    g.region === ipo.region &&
                    g.province.toLowerCase() === province.toLowerCase() &&
                    g.municipality.toLowerCase() === municipality.toLowerCase() &&
                    barangays.some(b => b.toLowerCase() === g.barangay.toLowerCase())
                );

                if (isWithinGida && !ipo.isWithinGida) {
                    return { ...ipo, isWithinGida: true };
                }
                return null;
            }).filter(Boolean) as IPO[];

            if (updates.length === 0) {
                alert("No IPOs found that need updating.");
                return;
            }

            // Update in Supabase
            for (const ipo of updates) {
                await supabase.from('ipos').update({ isWithinGida: true }).eq('id', ipo.id);
            }

            // Update local state
            setIpos(prev => prev.map(ipo => {
                const match = updates.find(u => u.id === ipo.id);
                return match ? match : ipo;
            }));

            alert(`Successfully updated ${updates.length} IPOs.`);
        } catch (error: any) {
            console.error("Error during retroactive GIDA update:", error);
            alert(`Failed to update IPOs: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleRetroactiveElcacUpdate = async () => {
        if (!supabase) return;
        if (!window.confirm("This will check all IPOs and update their 'Within ELCAC Areas' status based on the current ELCAC list. Continue?")) return;

        setIsUploading(true);
        try {
            const updates = ipos.map(ipo => {
                const { province, municipality, barangays } = parseLocation(ipo.location);
                const isWithinElcac = elcacList.some(e => 
                    e.region === ipo.region &&
                    e.province.toLowerCase() === province.toLowerCase() &&
                    e.municipality.toLowerCase() === municipality.toLowerCase() &&
                    barangays.some(b => b.toLowerCase() === e.barangay.toLowerCase())
                );

                if (isWithinElcac && !ipo.isWithinElcac) {
                    return { ...ipo, isWithinElcac: true };
                }
                return null;
            }).filter(Boolean) as IPO[];

            if (updates.length === 0) {
                alert("No IPOs found that need updating.");
                return;
            }

            // Update in Supabase
            for (const ipo of updates) {
                await supabase.from('ipos').update({ isWithinElcac: true }).eq('id', ipo.id);
            }

            // Update local state
            setIpos(prev => prev.map(ipo => {
                const match = updates.find(u => u.id === ipo.id);
                return match ? match : ipo;
            }));

            alert(`Successfully updated ${updates.length} IPOs.`);
        } catch (error: any) {
            console.error("Error during retroactive ELCAC update:", error);
            alert(`Failed to update IPOs: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    // Reset selection mode and sort on tab change
    useEffect(() => {
        setIsSelectionMode(false);
        setSelectedIds([]);
        setSortConfig(null);
    }, [activeTab]);

    // --- Sorting Logic ---
    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const SortableHeader = ({ label, sortKey }: { label: string; sortKey: string }) => {
        const isSorted = sortConfig?.key === sortKey;
        const directionIcon = isSorted ? (sortConfig?.direction === 'ascending' ? '▲' : '▼') : '↕';
        return (
            <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group select-none"
                onClick={() => requestSort(sortKey)}
            >
                <div className="flex items-center gap-1">
                    {label}
                    <span className={`text-xs ${isSorted ? 'text-accent opacity-100' : 'text-gray-400 opacity-0 group-hover:opacity-50'}`}>{directionIcon}</span>
                </div>
            </th>
        );
    };

    // --- Filtering & Sorting ---
    const processedUacs = useMemo(() => {
        let items = [...uacsList];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                i.uacsCode.toLowerCase().includes(lower) || 
                i.description.toLowerCase().includes(lower) || 
                i.particular.toLowerCase().includes(lower) ||
                (i.objectType && i.objectType.toLowerCase().includes(lower))
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [uacsList, searchTerm, sortConfig]);

    const processedParticulars = useMemo(() => {
        let items = [...particularList];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                i.particular.toLowerCase().includes(lower) || 
                i.type.toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [particularList, searchTerm, sortConfig]);

    const processedCommodities = useMemo(() => {
        let items = [...commodityList];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                i.particular.toLowerCase().includes(lower) || 
                i.type.toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [commodityList, searchTerm, sortConfig]);

    const processedRefCommodities = useMemo(() => {
        let items = [...refCommodities];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                i.name.toLowerCase().includes(lower) || 
                i.banner_program.toLowerCase().includes(lower) ||
                i.commodity_group.toLowerCase().includes(lower) ||
                i.recommended_soil.toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [refCommodities, searchTerm, sortConfig]);

    const processedGida = useMemo(() => {
        let items = [...gidaList];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                i.region.toLowerCase().includes(lower) || 
                i.province.toLowerCase().includes(lower) ||
                i.municipality.toLowerCase().includes(lower) ||
                i.barangay.toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [gidaList, searchTerm, sortConfig]);

    const processedElcac = useMemo(() => {
        let items = [...elcacList];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                i.region.toLowerCase().includes(lower) || 
                i.province.toLowerCase().includes(lower) ||
                i.municipality.toLowerCase().includes(lower) ||
                i.barangay.toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [elcacList, searchTerm, sortConfig]);

    // --- Handlers ---
    const handleOpenAdd = () => {
        setEditingItem(null);
        setUacsForm({ objectType: 'MOOE', particular: '', uacsCode: '', description: '' });
        setItemForm({ type: '', particular: '' });
        setCommodityForm({ type: 'Crop Commodity', particular: '' });
        setRefCommodityForm({
            name: '', banner_program: '', commodity_group: '', min_elevation_masl: 0, max_elevation_masl: 0,
            max_slope_percent: 0, wet_season_start: '', dry_season_start: '', recommended_soil: '',
            fertilizer_npk: '', watering_method: '', harvest_period_days: 0, ph_min: 0, ph_max: 0,
            climate_type_suitability: '', target_yield_ha: 0
        });
        setGidaForm({ region: '', province: '', municipality: '', barangay: '' });
        setElcacForm({ region: '', province: '', municipality: '', barangay: '' });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (item: any) => {
        setEditingItem(item);
        if (activeTab === 'UACS') {
            setUacsForm({
                objectType: item.objectType,
                particular: item.particular,
                uacsCode: item.uacsCode,
                description: item.description
            });
        } else if (activeTab === 'Items') {
            setItemForm({
                type: item.type,
                particular: item.particular
            });
        } else if (activeTab === 'Commodities') {
            setCommodityForm({
                type: item.type,
                particular: item.particular
            });
        } else if (activeTab === 'Crop References') {
            setRefCommodityForm({
                name: item.name,
                banner_program: item.banner_program,
                commodity_group: item.commodity_group,
                min_elevation_masl: item.min_elevation_masl,
                max_elevation_masl: item.max_elevation_masl,
                max_slope_percent: item.max_slope_percent,
                wet_season_start: item.wet_season_start,
                dry_season_start: item.dry_season_start,
                recommended_soil: item.recommended_soil,
                fertilizer_npk: item.fertilizer_npk,
                watering_method: item.watering_method,
                harvest_period_days: item.harvest_period_days || 0,
                ph_min: item.ph_min || 0,
                ph_max: item.ph_max || 0,
                climate_type_suitability: item.climate_type_suitability || '',
                target_yield_ha: item.target_yield_ha || 0
            });
        } else if (activeTab === 'GIDA') {
            setGidaForm({
                region: item.region,
                province: item.province,
                municipality: item.municipality,
                barangay: item.barangay
            });
        } else {
            setElcacForm({
                region: item.region,
                province: item.province,
                municipality: item.municipality,
                barangay: item.barangay
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const id = editingItem ? editingItem.id : crypto.randomUUID();

        if (activeTab === 'UACS') {
            const newData = { id, ...uacsForm };
            if (editingItem) {
                setUacsList(prev => prev.map(i => i.id === id ? newData : i));
            } else {
                setUacsList(prev => [newData, ...prev]);
            }
        } else if (activeTab === 'Items') {
            const newData = { id, ...itemForm };
            if (editingItem) {
                setParticularList(prev => prev.map(i => i.id === id ? newData : i));
            } else {
                setParticularList(prev => [newData, ...prev]);
            }
        } else if (activeTab === 'Commodities') {
            const newData = { id, ...commodityForm };
            if (editingItem) {
                setCommodityList(prev => prev.map(i => i.id === id ? newData : i));
            } else {
                setCommodityList(prev => [newData, ...prev]);
            }
        } else if (activeTab === 'Crop References') {
            const newData = { id, ...refCommodityForm };
            if (editingItem) {
                setRefCommodities(prev => prev.map(i => i.id === id ? newData : i));
            } else {
                setRefCommodities(prev => [newData, ...prev]);
            }
        } else if (activeTab === 'GIDA') {
            if (supabase) {
                if (editingItem) {
                    const { error } = await supabase.from('gida_areas').update(gidaForm).eq('id', editingItem.id);
                    if (error) {
                        console.error("Error updating GIDA area:", error);
                        alert(`Failed to update GIDA area: ${error.message}`);
                        return;
                    }
                    const newData = { id: editingItem.id, ...gidaForm };
                    setGidaList(prev => prev.map(i => i.id === editingItem.id ? newData : i));
                } else {
                    const { data, error } = await supabase.from('gida_areas').insert(gidaForm).select();
                    if (error) {
                        console.error("Error inserting GIDA area:", error);
                        alert(`Failed to add GIDA area: ${error.message}`);
                        return;
                    }
                    if (data && data.length > 0) {
                        setGidaList(prev => [data[0] as GidaArea, ...prev]);
                    }
                }
            } else {
                const newData = { id, ...gidaForm };
                if (editingItem) {
                    setGidaList(prev => prev.map(i => i.id === id ? newData : i));
                } else {
                    setGidaList(prev => [newData, ...prev]);
                }
            }
        } else {
            if (supabase) {
                if (editingItem) {
                    const { error } = await supabase.from('elcac_areas').update(elcacForm).eq('id', editingItem.id);
                    if (error) {
                        console.error("Error updating ELCAC area:", error);
                        alert(`Failed to update ELCAC area: ${error.message}`);
                        return;
                    }
                    const newData = { id: editingItem.id, ...elcacForm };
                    setElcacList(prev => prev.map(i => i.id === editingItem.id ? newData : i));
                } else {
                    const { data, error } = await supabase.from('elcac_areas').insert(elcacForm).select();
                    if (error) {
                        console.error("Error inserting ELCAC area:", error);
                        alert(`Failed to add ELCAC area: ${error.message}`);
                        return;
                    }
                    if (data && data.length > 0) {
                        setElcacList(prev => [data[0] as ElcacArea, ...prev]);
                    }
                }
            } else {
                const newData = { id, ...elcacForm };
                if (editingItem) {
                    setElcacList(prev => prev.map(i => i.id === id ? newData : i));
                } else {
                    setElcacList(prev => [newData, ...prev]);
                }
            }
        }
        setIsModalOpen(false);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteItem) return;
        if (activeTab === 'UACS') {
            setUacsList(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'Items') {
            setParticularList(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'Commodities') {
            setCommodityList(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'Crop References') {
            setRefCommodities(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'GIDA') {
            if (supabase) {
                const { error } = await supabase.from('gida_areas').delete().eq('id', deleteItem.id);
                if (error) {
                    console.error("Error deleting GIDA area:", error);
                    alert(`Failed to delete GIDA area: ${error.message}`);
                    return;
                }
            }
            setGidaList(prev => prev.filter(i => i.id !== deleteItem.id));
        } else {
            if (supabase) {
                const { error } = await supabase.from('elcac_areas').delete().eq('id', deleteItem.id);
                if (error) {
                    console.error("Error deleting ELCAC area:", error);
                    alert(`Failed to delete ELCAC area: ${error.message}`);
                    return;
                }
            }
            setElcacList(prev => prev.filter(i => i.id !== deleteItem.id));
        }
        setDeleteItem(null);
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
        const currentList = activeTab === 'UACS' ? processedUacs : (activeTab === 'Items' ? processedParticulars : (activeTab === 'Commodities' ? processedCommodities : (activeTab === 'GIDA' ? processedGida : processedElcac)));
        if (e.target.checked) {
            const ids = currentList.map(i => i.id);
            setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
        } else {
            const idsToRemove = new Set(currentList.map(i => i.id));
            setSelectedIds(prev => prev.filter(id => !idsToRemove.has(id)));
        }
    };

    const handleSelectRow = (id: string) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(i => i !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const confirmMultiDelete = async () => {
        if (activeTab === 'UACS') {
            setUacsList(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'Items') {
            setParticularList(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'Commodities') {
            setCommodityList(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'Crop References') {
            setRefCommodities(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'GIDA') {
            if (supabase) {
                const { error } = await supabase.from('gida_areas').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting GIDA areas:", error);
                    alert(`Failed to delete GIDA areas: ${error.message}`);
                    return;
                }
            }
            setGidaList(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else {
            if (supabase) {
                const { error } = await supabase.from('elcac_areas').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting ELCAC areas:", error);
                    alert(`Failed to delete ELCAC areas: ${error.message}`);
                    return;
                }
            }
            setElcacList(prev => prev.filter(i => !selectedIds.includes(i.id)));
        }
        setIsMultiDeleteModalOpen(false);
        setIsSelectionMode(false);
        setSelectedIds([]);
    };

    // --- Import / Export Handlers ---
    const handleDownloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        let ws;
        let filename;

        if (activeTab === 'UACS') {
            const headers = ['objectType', 'particular', 'uacsCode', 'description'];
            const example = [{
                objectType: 'MOOE',
                particular: 'Travelling Expenses',
                uacsCode: '50201010-00',
                description: 'Travelling Expenses - Local'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'UACS_Template.xlsx';
        } else if (activeTab === 'Items') {
            const headers = ['type', 'particular'];
            const example = [{
                type: 'Agricultural Inputs',
                particular: 'Carabao'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Items_Template.xlsx';
        } else if (activeTab === 'Commodities') {
            const headers = ['type', 'particular'];
            const example = [{
                type: 'Crop Commodity',
                particular: 'Coffee'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Commodities_Template.xlsx';
        } else if (activeTab === 'Crop References') {
            const headers = ['name', 'banner_program', 'commodity_group', 'min_elevation_masl', 'max_elevation_masl', 'max_slope_percent', 'wet_season_start', 'dry_season_start', 'recommended_soil', 'fertilizer_npk', 'watering_method', 'harvest_period_days', 'ph_min', 'ph_max', 'climate_type_suitability', 'target_yield_ha'];
            const example = [{
                name: 'Rice (Lowland)',
                banner_program: 'Rice',
                commodity_group: 'Cereal',
                min_elevation_masl: 0,
                max_elevation_masl: 500,
                max_slope_percent: 3,
                wet_season_start: 'June-July',
                dry_season_start: 'Jan-Feb',
                recommended_soil: 'Clay Loam / Alluvial',
                fertilizer_npk: '14-14-14 (Basal), 46-0-0 (Top-dress)',
                watering_method: 'Continuous Flooding / AWD',
                harvest_period_days: 120,
                ph_min: 5.5,
                ph_max: 7.0,
                climate_type_suitability: 'Type I, II, III, IV',
                target_yield_ha: 5.5
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Crop_References_Template.xlsx';
        } else if (activeTab === 'GIDA') {
            const headers = ['region', 'province', 'municipality', 'barangay'];
            const example = [{
                region: 'Region I',
                province: 'Ilocos Norte',
                municipality: 'Adams',
                barangay: 'Adams (Pob.)'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'GIDA_Areas_Template.xlsx';
        } else {
            const headers = ['region', 'province', 'municipality', 'barangay'];
            const example = [{
                region: 'Region I',
                province: 'Ilocos Norte',
                municipality: 'Adams',
                barangay: 'Adams (Pob.)'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'ELCAC_Areas_Template.xlsx';
        }

        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, filename);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

                if (activeTab === 'UACS') {
                    const newItems: ReferenceUacs[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        objectType: row.objectType || 'MOOE',
                        particular: row.particular || '',
                        uacsCode: row.uacsCode ? String(row.uacsCode) : '',
                        description: row.description || ''
                    })).filter(i => i.uacsCode && i.particular);

                    if (supabase) {
                        const { error } = await supabase.from('reference_uacs').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            // Update local state to reflect changes without full reload
                            setUacsList(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} UACS codes uploaded successfully to database.`);
                        }
                    } else {
                        setUacsList(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} UACS codes imported locally.`);
                    }
                } else if (activeTab === 'Items') {
                    const newItems: ReferenceParticular[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        type: row.type || 'Others',
                        particular: row.particular || ''
                    })).filter(i => i.particular);

                    if (supabase) {
                        const { error } = await supabase.from('reference_particulars').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            setParticularList(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} items uploaded successfully to database.`);
                        }
                    } else {
                        setParticularList(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} items imported locally.`);
                    }
                } else if (activeTab === 'Commodities') {
                    const newItems: ReferenceCommodity[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        type: row.type || 'Crop Commodity',
                        particular: row.particular || ''
                    })).filter(i => i.particular);

                    if (supabase) {
                        const { error } = await supabase.from('reference_commodities').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            setCommodityList(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} commodities uploaded successfully to database.`);
                        }
                    } else {
                        setCommodityList(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} commodities imported locally.`);
                    }
                } else if (activeTab === 'Crop References') {
                    const newItems: RefCommodity[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        name: row.name || '',
                        banner_program: row.banner_program || '',
                        commodity_group: row.commodity_group || '',
                        min_elevation_masl: Number(row.min_elevation_masl) || 0,
                        max_elevation_masl: Number(row.max_elevation_masl) || 0,
                        max_slope_percent: Number(row.max_slope_percent) || 0,
                        wet_season_start: row.wet_season_start || '',
                        dry_season_start: row.dry_season_start || '',
                        recommended_soil: row.recommended_soil || '',
                        fertilizer_npk: row.fertilizer_npk || '',
                        watering_method: row.watering_method || '',
                        harvest_period_days: Number(row.harvest_period_days) || 0,
                        ph_min: Number(row.ph_min) || 0,
                        ph_max: Number(row.ph_max) || 0,
                        climate_type_suitability: row.climate_type_suitability || '',
                        target_yield_ha: Number(row.target_yield_ha) || 0
                    })).filter(i => i.name);

                    if (supabase) {
                        const { error } = await supabase.from('ref_commodities').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            setRefCommodities(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} crop references uploaded successfully to database.`);
                        }
                    } else {
                        setRefCommodities(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} crop references imported locally.`);
                    }
                } else if (activeTab === 'GIDA') {
                    const newItems = jsonData.map((row: any) => ({
                        region: normalizeRegionName(row.region || ''),
                        province: row.province || '',
                        municipality: row.municipality || '',
                        barangay: row.barangay || ''
                    })).filter(i => i.region && i.province && i.municipality && i.barangay);

                    if (supabase) {
                        const { data, error } = await supabase.from('gida_areas').insert(newItems).select();
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            if (data) {
                                setGidaList(prev => [...(data as GidaArea[]), ...prev]);
                            }
                            alert(`${newItems.length} GIDA areas uploaded successfully to database.`);
                        }
                    } else {
                        const localItems = newItems.map(item => ({...item, id: crypto.randomUUID()}));
                        setGidaList(prev => [...localItems, ...prev]);
                        alert(`${newItems.length} GIDA areas imported locally.`);
                    }
                } else {
                    const newItems = jsonData.map((row: any) => ({
                        region: normalizeRegionName(row.region || ''),
                        province: row.province || '',
                        municipality: row.municipality || '',
                        barangay: row.barangay || ''
                    })).filter(i => i.region && i.province && i.municipality && i.barangay);

                    if (supabase) {
                        const { data, error } = await supabase.from('elcac_areas').insert(newItems).select();
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            if (data) {
                                setElcacList(prev => [...(data as ElcacArea[]), ...prev]);
                            }
                            alert(`${newItems.length} ELCAC areas uploaded successfully to database.`);
                        }
                    } else {
                        const localItems = newItems.map(item => ({...item, id: crypto.randomUUID()}));
                        setElcacList(prev => [...localItems, ...prev]);
                        alert(`${newItems.length} ELCAC areas imported locally.`);
                    }
                }
            } catch (error: any) {
                console.error("Error processing XLSX file:", error);
                alert(`Failed to import file. ${error.message}`);
            } finally {
                setIsUploading(false);
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

    const getCurrentList = () => {
        if (activeTab === 'UACS') return processedUacs;
        if (activeTab === 'Items') return processedParticulars;
        if (activeTab === 'Commodities') return processedCommodities;
        if (activeTab === 'Crop References') return processedRefCommodities;
        if (activeTab === 'GIDA') return processedGida;
        return processedElcac;
    }

    return (
        <div className="space-y-6">
            {/* Multi Delete Modal */}
            {isMultiDeleteModalOpen && canEdit && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold text-red-600 dark:text-red-400">Confirm Bulk Deletion</h3>
                        <p className="my-4 text-gray-700 dark:text-gray-300">
                            Are you sure you want to delete the <strong>{selectedIds.length}</strong> selected item(s)? 
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmMultiDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete All Selected</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header with Title and Add Button */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">System References</h2>
                {canEdit && (
                    <button 
                        onClick={handleOpenAdd}
                        className="px-4 py-2 bg-accent hover:brightness-95 text-white rounded-md shadow-sm text-sm font-medium"
                    >
                        + Add New {activeTab === 'UACS' ? 'UACS Code' : activeTab === 'Items' ? 'Item' : activeTab === 'Commodities' ? 'Commodity' : activeTab === 'Crop References' ? 'Crop Reference' : activeTab === 'GIDA' ? 'GIDA Area' : 'ELCAC Area'}
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => { setActiveTab('UACS'); setSearchTerm(''); }}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'UACS'
                                ? 'border-accent text-accent'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        UACS Codes
                    </button>
                    <button
                        onClick={() => { setActiveTab('Items'); setSearchTerm(''); }}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'Items'
                                ? 'border-accent text-accent'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        Subproject Items
                    </button>
                    <button
                        onClick={() => { setActiveTab('Commodities'); setSearchTerm(''); }}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'Commodities'
                                ? 'border-accent text-accent'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        Commodities
                    </button>
                    <button
                        onClick={() => { setActiveTab('Crop References'); setSearchTerm(''); }}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'Crop References'
                                ? 'border-accent text-accent'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        Crop References
                    </button>
                    {currentUser?.role === 'Administrator' && (
                        <>
                            <button
                                onClick={() => { setActiveTab('GIDA'); setSearchTerm(''); }}
                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === 'GIDA'
                                        ? 'border-accent text-accent'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                }`}
                            >
                                GIDA Areas
                            </button>
                            <button
                                onClick={() => { setActiveTab('ELCAC'); setSearchTerm(''); }}
                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === 'ELCAC'
                                        ? 'border-accent text-accent'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                }`}
                            >
                                ELCAC Areas
                            </button>
                        </>
                    )}
                </nav>
            </div>

            {/* Search and Bulk Actions Row */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="w-full md:w-1/3">
                    <input 
                        type="text" 
                        placeholder="Search..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                </div>
                
                {canEdit && (
                    <div className="flex flex-wrap gap-2 items-center">
                        {isSelectionMode && selectedIds.length > 0 && (
                            <button onClick={() => setIsMultiDeleteModalOpen(true)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700">
                                Delete Selected ({selectedIds.length})
                            </button>
                        )}
                        <button 
                            onClick={handleDownloadTemplate}
                            className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md shadow-sm text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                            Download Template
                        </button>
                        <label 
                            htmlFor="ref-upload" 
                            className={`inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md shadow-sm text-sm font-medium hover:bg-blue-700 ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                            {isUploading ? 'Uploading...' : 'Upload XLSX'}
                        </label>
                        <input 
                            id="ref-upload" 
                            type="file" 
                            className="hidden" 
                            onChange={handleFileUpload} 
                            accept=".xlsx, .xls"
                            disabled={isUploading}
                        />
                        {activeTab === 'GIDA' && (
                            <button 
                                onClick={handleRetroactiveGidaUpdate}
                                disabled={isUploading}
                                className={`px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-sm text-sm font-medium ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title="Check all IPOs and update GIDA status"
                            >
                                Retroactive Update
                            </button>
                        )}
                        {activeTab === 'ELCAC' && (
                            <button 
                                onClick={handleRetroactiveElcacUpdate}
                                disabled={isUploading}
                                className={`px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-sm text-sm font-medium ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title="Check all IPOs and update ELCAC status"
                            >
                                Retroactive Update
                            </button>
                        )}
                        <button
                            onClick={handleToggleSelectionMode}
                            className={`inline-flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 shadow-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 ${isSelectionMode ? 'bg-gray-200 dark:bg-gray-600 text-red-600' : 'bg-white dark:bg-gray-700 text-gray-500'}`}
                            title="Toggle Multi-Delete Mode"
                        >
                            <TrashIcon />
                        </button>
                    </div>
                )}
            </div>

            {/* Table Area */}
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                {activeTab === 'UACS' ? (
                                    <>
                                        <SortableHeader label="Object Type" sortKey="objectType" />
                                        <SortableHeader label="Particular" sortKey="particular" />
                                        <SortableHeader label="UACS Code" sortKey="uacsCode" />
                                        <SortableHeader label="Description" sortKey="description" />
                                    </>
                                ) : activeTab === 'Items' ? (
                                    <>
                                        <SortableHeader label="Item Type" sortKey="type" />
                                        <SortableHeader label="Item Particular" sortKey="particular" />
                                    </>
                                ) : activeTab === 'Commodities' ? (
                                    <>
                                        <SortableHeader label="Commodity Type" sortKey="type" />
                                        <SortableHeader label="Particulars" sortKey="particular" />
                                    </>
                                ) : activeTab === 'Crop References' ? (
                                    <>
                                        <SortableHeader label="Name" sortKey="name" />
                                        <SortableHeader label="Banner Program" sortKey="banner_program" />
                                        <SortableHeader label="Group" sortKey="commodity_group" />
                                        <SortableHeader label="Elevation (masl)" sortKey="min_elevation_masl" />
                                        <SortableHeader label="Slope (%)" sortKey="max_slope_percent" />
                                        <SortableHeader label="Soil" sortKey="recommended_soil" />
                                        <SortableHeader label="Harvest (days)" sortKey="harvest_period_days" />
                                        <SortableHeader label="pH Range" sortKey="ph_min" />
                                        <SortableHeader label="Climate" sortKey="climate_type_suitability" />
                                        <SortableHeader label="Yield (t/ha)" sortKey="target_yield_ha" />
                                    </>
                                ) : (
                                    <>
                                        <SortableHeader label="Region" sortKey="region" />
                                        <SortableHeader label="Province" sortKey="province" />
                                        <SortableHeader label="Municipality" sortKey="municipality" />
                                        <SortableHeader label="Barangay" sortKey="barangay" />
                                    </>
                                )}
                                {canEdit && (
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        {isSelectionMode ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <span className="text-xs">Select All</span>
                                                <input 
                                                    type="checkbox" 
                                                    onChange={handleSelectAll} 
                                                    checked={getCurrentList().length > 0 && getCurrentList().every((i: any) => selectedIds.includes(i.id))}
                                                    className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                />
                                            </div>
                                        ) : (
                                            "Actions"
                                        )}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {getCurrentList().length > 0 ? (
                                getCurrentList().map((item: any) => (
                                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        {activeTab === 'UACS' ? (
                                            <>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.objectType}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.particular}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-300">{item.uacsCode}</td>
                                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">{item.description}</td>
                                            </>
                                        ) : activeTab === 'Items' || activeTab === 'Commodities' ? (
                                            <>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.type}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.particular}</td>
                                            </>
                                        ) : activeTab === 'Crop References' ? (
                                            <>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.name}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.banner_program}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.commodity_group}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.min_elevation_masl} - {item.max_elevation_masl}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.max_slope_percent}%</td>
                                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">{item.recommended_soil}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.harvest_period_days}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.ph_min} - {item.ph_max}</td>
                                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">{item.climate_type_suitability}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.target_yield_ha}</td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.region}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.province}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.municipality}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.barangay}</td>
                                            </>
                                        )}
                                        {canEdit && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                {isSelectionMode ? (
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.includes(item.id)} 
                                                        onChange={(e) => { e.stopPropagation(); handleSelectRow(item.id); }} 
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="mr-3 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                    />
                                                ) : (
                                                    <>
                                                        <button onClick={() => handleOpenEdit(item)} className="text-accent hover:brightness-110 mr-3">Edit</button>
                                                        <button onClick={() => setDeleteItem(item)} className="text-red-600 hover:text-red-900">Delete</button>
                                                    </>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={canEdit ? (activeTab === 'UACS' ? 5 : activeTab === 'GIDA' || activeTab === 'ELCAC' ? 5 : 3) : (activeTab === 'UACS' ? 4 : activeTab === 'GIDA' || activeTab === 'ELCAC' ? 4 : 2)} className="px-6 py-4 text-center text-sm text-gray-500">No items found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && canEdit && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            {editingItem ? 'Edit' : 'Add New'} {activeTab === 'UACS' ? 'UACS Code' : activeTab === 'Items' ? 'Subproject Item' : activeTab === 'Commodities' ? 'Commodity' : activeTab === 'Crop References' ? 'Crop Reference' : activeTab === 'GIDA' ? 'GIDA Area' : 'ELCAC Area'}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            {activeTab === 'UACS' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Object Type</label>
                                        <select 
                                            value={uacsForm.objectType}
                                            onChange={e => setUacsForm({...uacsForm, objectType: e.target.value})}
                                            className={commonInputClasses}
                                        >
                                            {objectTypes.map(ot => <option key={ot} value={ot}>{ot}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particular</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={uacsForm.particular}
                                            onChange={e => setUacsForm({...uacsForm, particular: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UACS Code</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={uacsForm.uacsCode}
                                            onChange={e => setUacsForm({...uacsForm, uacsCode: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={uacsForm.description}
                                            onChange={e => setUacsForm({...uacsForm, description: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                </>
                            ) : activeTab === 'Items' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Item Type</label>
                                        <input 
                                            type="text" 
                                            required
                                            list="item-types"
                                            value={itemForm.type}
                                            onChange={e => setItemForm({...itemForm, type: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                        <datalist id="item-types">
                                            <option value="Agricultural Inputs" />
                                            <option value="Equipment" />
                                            <option value="Infrastructure" />
                                            <option value="Others" />
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Item Particular</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={itemForm.particular}
                                            onChange={e => setItemForm({...itemForm, particular: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                </>
                            ) : activeTab === 'Commodities' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Commodity Type</label>
                                        <select
                                            required
                                            value={commodityForm.type}
                                            onChange={e => setCommodityForm({...commodityForm, type: e.target.value})}
                                            className={commonInputClasses}
                                        >
                                            {referenceCommodityTypes.map(type => <option key={type} value={type}>{type}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particulars</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={commodityForm.particular}
                                            onChange={e => setCommodityForm({...commodityForm, particular: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                </>
                            ) : activeTab === 'Crop References' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                                        <input type="text" required value={refCommodityForm.name} onChange={e => setRefCommodityForm({...refCommodityForm, name: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Banner Program</label>
                                        <input type="text" required value={refCommodityForm.banner_program} onChange={e => setRefCommodityForm({...refCommodityForm, banner_program: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Commodity Group</label>
                                        <input type="text" required value={refCommodityForm.commodity_group} onChange={e => setRefCommodityForm({...refCommodityForm, commodity_group: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Min Elevation (masl)</label>
                                            <input type="number" required value={refCommodityForm.min_elevation_masl} onChange={e => setRefCommodityForm({...refCommodityForm, min_elevation_masl: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Max Elevation (masl)</label>
                                            <input type="number" required value={refCommodityForm.max_elevation_masl} onChange={e => setRefCommodityForm({...refCommodityForm, max_elevation_masl: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Max Slope (%)</label>
                                        <input type="number" required value={refCommodityForm.max_slope_percent} onChange={e => setRefCommodityForm({...refCommodityForm, max_slope_percent: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Wet Season Start</label>
                                            <input type="text" required value={refCommodityForm.wet_season_start} onChange={e => setRefCommodityForm({...refCommodityForm, wet_season_start: e.target.value})} className={commonInputClasses} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Dry Season Start</label>
                                            <input type="text" required value={refCommodityForm.dry_season_start} onChange={e => setRefCommodityForm({...refCommodityForm, dry_season_start: e.target.value})} className={commonInputClasses} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Recommended Soil</label>
                                        <input type="text" required value={refCommodityForm.recommended_soil} onChange={e => setRefCommodityForm({...refCommodityForm, recommended_soil: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fertilizer NPK</label>
                                        <input type="text" required value={refCommodityForm.fertilizer_npk} onChange={e => setRefCommodityForm({...refCommodityForm, fertilizer_npk: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Watering Method</label>
                                        <input type="text" required value={refCommodityForm.watering_method} onChange={e => setRefCommodityForm({...refCommodityForm, watering_method: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Harvest Period (days)</label>
                                            <input type="number" required value={refCommodityForm.harvest_period_days} onChange={e => setRefCommodityForm({...refCommodityForm, harvest_period_days: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Yield (t/ha)</label>
                                            <input type="number" step="0.01" required value={refCommodityForm.target_yield_ha} onChange={e => setRefCommodityForm({...refCommodityForm, target_yield_ha: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">pH Min</label>
                                            <input type="number" step="0.1" required value={refCommodityForm.ph_min} onChange={e => setRefCommodityForm({...refCommodityForm, ph_min: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">pH Max</label>
                                            <input type="number" step="0.1" required value={refCommodityForm.ph_max} onChange={e => setRefCommodityForm({...refCommodityForm, ph_max: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Climate Suitability</label>
                                        <input type="text" required value={refCommodityForm.climate_type_suitability} onChange={e => setRefCommodityForm({...refCommodityForm, climate_type_suitability: e.target.value})} className={commonInputClasses} />
                                    </div>
                                </>
                            ) : activeTab === 'GIDA' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Region</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={gidaForm.region}
                                            onChange={e => setGidaForm({...gidaForm, region: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Province</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={gidaForm.province}
                                            onChange={e => setGidaForm({...gidaForm, province: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Municipality</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={gidaForm.municipality}
                                            onChange={e => setGidaForm({...gidaForm, municipality: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Barangay</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={gidaForm.barangay}
                                            onChange={e => setGidaForm({...gidaForm, barangay: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Region</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={elcacForm.region}
                                            onChange={e => setElcacForm({...elcacForm, region: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Province</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={elcacForm.province}
                                            onChange={e => setElcacForm({...elcacForm, province: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Municipality</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={elcacForm.municipality}
                                            onChange={e => setElcacForm({...elcacForm, municipality: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Barangay</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={elcacForm.barangay}
                                            onChange={e => setElcacForm({...elcacForm, barangay: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                </>
                            )}
                            <div className="flex justify-end space-x-3 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:brightness-95"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteItem && canEdit && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Delete</h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Are you sure you want to delete this item? This action cannot be undone.
                        </p>
                        <div className="flex justify-end space-x-3 pt-4">
                            <button 
                                onClick={() => setDeleteItem(null)}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleDeleteConfirm}
                                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default References;
