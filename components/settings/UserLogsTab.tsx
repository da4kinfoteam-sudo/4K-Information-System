
// Author: 4K
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { fetchAll } from '../../hooks/useSupabaseTable';

interface UserLog {
    id: number;
    description: string;
    username: string;
    operating_unit: string;
    created_at: string;
}

const UserLogsTab: React.FC = () => {
    const [logs, setLogs] = useState<UserLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof UserLog; direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });

    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            if (supabase) {
                const data = await fetchAll('user_logs', 'created_at', false);
                if (data) {
                    setLogs(data as UserLog[]);
                }
            }
            setLoading(false);
        };
        fetchLogs();
    }, []);

    const processedLogs = useMemo(() => {
        let filtered = [...logs];

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(log => 
                log.description.toLowerCase().includes(lower) ||
                log.username.toLowerCase().includes(lower) ||
                log.operating_unit.toLowerCase().includes(lower)
            );
        }

        filtered.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [logs, searchTerm, sortConfig]);

    const paginatedLogs = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedLogs.slice(startIndex, startIndex + itemsPerPage);
    }, [processedLogs, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedLogs.length / itemsPerPage);

    const requestSort = (key: keyof UserLog) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    const SortableHeader = ({ label, sortKey }: { label: string; sortKey: keyof UserLog }) => (
        <th 
            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => requestSort(sortKey)}
        >
            <div className="flex items-center gap-1">
                {label}
                <span>{sortConfig.key === sortKey ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</span>
            </div>
        </th>
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">User Audit Logs</h3>
                <div className="flex items-center gap-2">
                    <input 
                        type="text" 
                        placeholder="Search logs..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-accent focus:border-accent"
                    />
                </div>
            </div>

            <div className="overflow-x-auto shadow-md rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <SortableHeader label="Description" sortKey="description" />
                            <SortableHeader label="Username" sortKey="username" />
                            <SortableHeader label="Operating Unit" sortKey="operating_unit" />
                            <SortableHeader label="Timestamp" sortKey="created_at" />
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {loading ? (
                            <tr><td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">Loading logs...</td></tr>
                        ) : paginatedLogs.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">No logs found.</td></tr>
                        ) : (
                            paginatedLogs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{log.description}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.username}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.operating_unit}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(log.created_at)}</td>
                                </tr>
                            ))
                        )}
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
                    <span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, processedLogs.length)} to {Math.min(currentPage * itemsPerPage, processedLogs.length)} of {processedLogs.length} entries</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                        <span className="px-2 font-medium">{currentPage} / {totalPages}</span>
                        <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserLogsTab;
