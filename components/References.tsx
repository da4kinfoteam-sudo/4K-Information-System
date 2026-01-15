
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { objectTypes } from '../constants';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

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

interface ReferencesProps {
    uacsList: ReferenceUacs[];
    setUacsList: React.Dispatch<React.SetStateAction<ReferenceUacs[]>>;
    particularList: ReferenceParticular[];
    setParticularList: React.Dispatch<React.SetStateAction<ReferenceParticular[]>>;
}

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const References: React.FC<ReferencesProps> = ({ uacsList, setUacsList, particularList, setParticularList }) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'UACS' | 'Items'>('UACS');
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

    // --- Handlers ---
    const handleOpenAdd = () => {
        setEditingItem(null);
        setUacsForm({ objectType: 'MOOE', particular: '', uacsCode: '', description: '' });
        setItemForm({ type: '', particular: '' });
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
        } else {
            setItemForm({
                type: item.type,
                particular: item.particular
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (activeTab === 'UACS') {
            if (editingItem) {
                setUacsList(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...uacsForm } : i));
            } else {
                const newItem: ReferenceUacs = {
                    id: crypto.randomUUID(),
                    ...uacsForm
                };
                setUacsList(prev => [newItem, ...prev]);
            }
        } else {
            if (editingItem) {
                setParticularList(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...itemForm } : i));
            } else {
                const newItem: ReferenceParticular = {
                    id: crypto.randomUUID(),
                    ...itemForm
                };
                setParticularList(prev => [newItem, ...prev]);
            }
        }
        setIsModalOpen(false);
    };

    const handleDeleteConfirm = () => {
        if (!deleteItem) return;
        if (activeTab === 'UACS') {
            setUacsList(prev => prev.filter(i => i.id !== deleteItem.id));
        } else {
            setParticularList(prev => prev.filter(i => i.id !== deleteItem.id));
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
        const currentList = activeTab === 'UACS' ? processedUacs : processedParticulars;
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

    const confirmMultiDelete = () => {
        if (activeTab === 'UACS') {
            setUacsList(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else {
            setParticularList(prev => prev.filter(i => !selectedIds.includes(i.id)));
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
        } else {
            const headers = ['type', 'particular'];
            const example = [{
                type: 'Agricultural Inputs',
                particular: 'Carabao'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Items_Template.xlsx';
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
                } else {
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
                        + Add New {activeTab === 'UACS' ? 'UACS Code' : 'Item'}
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
                                ) : (
                                    <>
                                        <SortableHeader label="Item Type" sortKey="type" />
                                        <SortableHeader label="Item Particular" sortKey="particular" />
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
                                                    checked={(activeTab === 'UACS' ? processedUacs : processedParticulars).length > 0 && (activeTab === 'UACS' ? processedUacs : processedParticulars).every(i => selectedIds.includes(i.id))}
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
                            {activeTab === 'UACS' ? (
                                processedUacs.length > 0 ? (
                                    processedUacs.map(item => (
                                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.objectType}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.particular}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-300">{item.uacsCode}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">{item.description}</td>
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
                                    <tr><td colSpan={canEdit ? 5 : 4} className="px-6 py-4 text-center text-sm text-gray-500">No UACS codes found.</td></tr>
                                )
                            ) : (
                                processedParticulars.length > 0 ? (
                                    processedParticulars.map(item => (
                                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.type}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.particular}</td>
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
                                    <tr><td colSpan={canEdit ? 3 : 2} className="px-6 py-4 text-center text-sm text-gray-500">No items found.</td></tr>
                                )
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
                            {editingItem ? 'Edit' : 'Add New'} {activeTab === 'UACS' ? 'UACS Code' : 'Subproject Item'}
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
                            ) : (
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
