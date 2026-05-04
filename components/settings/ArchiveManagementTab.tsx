
// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { TrashItem } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { format } from 'date-fns';

const ArchiveManagementTab: React.FC = () => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const [items, setItems] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const fetchTrashItems = async () => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('trash_bin')
                .select('*')
                .order('deleted_at', { ascending: false });

            if (error) {
                console.error('Error fetching trash items:', error);
            } else {
                setItems(data || []);
            }
        } catch (err) {
            console.error('Archive Fetch Exception:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTrashItems();
    }, []);

    const paginatedItems = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return items.slice(startIndex, startIndex + itemsPerPage);
    }, [items, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(items.length / itemsPerPage);

    const getItemName = (item: TrashItem) => {
        const data = item.data;
        if (!data) return 'N/A';
        
        switch (item.entity_type) {
            case 'subproject': return data.name || data.uid || 'Unnamed Subproject';
            case 'activity': return data.name || data.uid || 'Unnamed Activity';
            case 'office_requirement': return data.equipment || data.uid || 'Unnamed Equipment';
            case 'staffing_requirement': return data.personnelPosition || data.uid || 'Unnamed Position';
            case 'other_program_expense': return data.particulars || data.uid || 'Unnamed Expense';
            default: return data.name || data.title || data.uid || 'N/A';
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(items.map(i => i.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: number) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const getTableName = (entityType: string) => {
        switch (entityType) {
            case 'subproject': return 'subprojects';
            case 'activity': return 'activities';
            case 'office_requirement': return 'office_requirements';
            case 'staffing_requirement': return 'staffing_requirements';
            case 'other_program_expense': return 'other_program_expenses';
            default: return null;
        }
    };

    const recoverItem = async (item: TrashItem) => {
        const tableName = getTableName(item.entity_type);
        if (!tableName) {
            alert(`Unknown entity type: ${item.entity_type}`);
            return;
        }

        setIsProcessing(true);
        try {
            // 1. Insert back to original table
            const { error: insertError } = await supabase
                .from(tableName)
                .insert([item.data]);

            if (insertError) throw insertError;

            // 2. Delete from trash_bin
            const { error: deleteError } = await supabase
                .from('trash_bin')
                .delete()
                .eq('id', item.id);

            if (deleteError) throw deleteError;

            await logAction('Recovered item from archive', 'Archive', undefined, item.entity_type, String(item.original_id));
            await fetchTrashItems();
            setSelectedIds(prev => prev.filter(id => id !== item.id));
        } catch (error: any) {
            console.error('Error recovering item:', error);
            alert(`Failed to recover item: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const permanentlyDeleteItem = async (id: number) => {
        if (!window.confirm('Are you sure you want to permanently delete this item? This action cannot be undone.')) return;

        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('trash_bin')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await logAction('Permanently deleted item from archive', 'Archive', undefined, 'trash_bin', String(id));
            await fetchTrashItems();
            setSelectedIds(prev => prev.filter(sid => sid !== id));
        } catch (error: any) {
            console.error('Error deleting item:', error);
            alert(`Failed to delete item: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBulkRecover = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Are you sure you want to recover ${selectedIds.length} items?`)) return;

        setIsProcessing(true);
        let successCount = 0;
        let failCount = 0;

        for (const id of selectedIds) {
            const item = items.find(i => i.id === id);
            if (!item) continue;

            const tableName = getTableName(item.entity_type);
            if (!tableName) {
                failCount++;
                continue;
            }

            try {
                const { error: insertError } = await supabase.from(tableName).insert([item.data]);
                if (insertError) throw insertError;

                const { error: deleteError } = await supabase.from('trash_bin').delete().eq('id', item.id);
                if (deleteError) throw deleteError;

                successCount++;
            } catch (err) {
                console.error(`Failed to recover item ${id}:`, err);
                failCount++;
            }
        }

        await logAction(`Bulk recovered ${successCount} items from archive`, 'Archive', undefined, 'trash_bin');
        await fetchTrashItems();
        setSelectedIds([]);
        setIsProcessing(false);

        if (failCount > 0) {
            alert(`Recovered ${successCount} items. Failed to recover ${failCount} items.`);
        } else {
            alert(`Successfully recovered ${successCount} items.`);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete ${selectedIds.length} items? This cannot be undone.`)) return;

        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('trash_bin')
                .delete()
                .in('id', selectedIds);

            if (error) throw error;

            await logAction(`Bulk permanently deleted ${selectedIds.length} items from archive`, 'Archive', undefined, 'trash_bin');
            await fetchTrashItems();
            setSelectedIds([]);
        } catch (error: any) {
            console.error('Error bulk deleting items:', error);
            alert(`Failed to delete items: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Archive Management</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Recover or permanently delete archived items.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleBulkRecover}
                        disabled={selectedIds.length === 0 || isProcessing}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                        Recover Selected ({selectedIds.length})
                    </button>
                    <button
                        onClick={handleBulkDelete}
                        disabled={selectedIds.length === 0 || isProcessing}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                        Delete Permanently ({selectedIds.length})
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr>
                                <th className="px-6 py-3 text-left">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.length === paginatedItems.length && paginatedItems.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedIds(paginatedItems.map(i => i.id));
                                            } else {
                                                setSelectedIds([]);
                                            }
                                        }}
                                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name / Title</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Entity Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Deleted By</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Deleted At</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-gray-500 dark:text-gray-400">
                                        No items in the archive.
                                    </td>
                                </tr>
                            ) : (
                                paginatedItems.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => handleSelectOne(item.id)}
                                                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                            {getItemName(item)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 capitalize">
                                            {item.entity_type.replace(/_/g, ' ')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {item.deleted_by}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {format(new Date(item.deleted_at), 'MMM dd, yyyy HH:mm')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => recoverItem(item)}
                                                disabled={isProcessing}
                                                className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 mr-4 disabled:opacity-50"
                                            >
                                                Recover
                                            </button>
                                            <button
                                                onClick={() => permanentlyDeleteItem(item.id)}
                                                disabled={isProcessing}
                                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            <div className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-700 dark:text-gray-300">Show</span>
                    <select 
                        value={itemsPerPage} 
                        onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                        }} 
                        className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                    >
                        {[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}
                    </select>
                    <span className="text-gray-700 dark:text-gray-300">entries</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-700 dark:text-gray-300">
                        Showing {items.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, items.length)} of {items.length} entries
                    </span>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                            disabled={currentPage === 1} 
                            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Previous
                        </button>
                        <span className="px-2 font-medium text-gray-700 dark:text-gray-300">{currentPage} / {totalPages || 1}</span>
                        <button 
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                            disabled={currentPage === totalPages || totalPages === 0} 
                            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArchiveManagementTab;
