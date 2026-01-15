
// Author: 4K
import React, { useState, useMemo } from 'react';
import { Deadline, PlanningSchedule } from '../../constants';
import { supabase } from '../../supabaseClient';

interface SystemManagementTabProps {
    deadlines: Deadline[];
    setDeadlines: React.Dispatch<React.SetStateAction<Deadline[]>>;
    planningSchedules: PlanningSchedule[];
    setPlanningSchedules: React.Dispatch<React.SetStateAction<PlanningSchedule[]>>;
}

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

const SystemManagementTab: React.FC<SystemManagementTabProps> = ({ 
    deadlines, setDeadlines, planningSchedules, setPlanningSchedules 
}) => {
    // Modal State
    const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    
    // Forms
    const [deadlineForm, setDeadlineForm] = useState({ name: '', date: '' });
    const [scheduleForm, setScheduleForm] = useState({ name: '', startDate: '', endDate: '' });
    
    // Edit Selection
    const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);
    const [editingSchedule, setEditingSchedule] = useState<PlanningSchedule | null>(null);

    // Sorting State
    const [deadlineSort, setDeadlineSort] = useState<{ key: keyof Deadline; direction: 'asc' | 'desc' } | null>(null);
    const [scheduleSort, setScheduleSort] = useState<{ key: keyof PlanningSchedule; direction: 'asc' | 'desc' } | null>(null);

    // Bulk Selection State
    const [selectedDeadlines, setSelectedDeadlines] = useState<number[]>([]);
    const [selectedSchedules, setSelectedSchedules] = useState<number[]>([]);

    // --- Helpers ---
    const handleSort = (key: string, type: 'deadline' | 'schedule') => {
        if (type === 'deadline') {
            setDeadlineSort(prev => ({
                key: key as keyof Deadline,
                direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
            }));
        } else {
            setScheduleSort(prev => ({
                key: key as keyof PlanningSchedule,
                direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
            }));
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>, type: 'deadline' | 'schedule') => {
        if (type === 'deadline') {
            setSelectedDeadlines(e.target.checked ? deadlines.map(d => d.id) : []);
        } else {
            setSelectedSchedules(e.target.checked ? planningSchedules.map(s => s.id) : []);
        }
    };

    const handleSelectRow = (id: number, type: 'deadline' | 'schedule') => {
        if (type === 'deadline') {
            setSelectedDeadlines(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
        } else {
            setSelectedSchedules(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
        }
    };

    const handleBulkDelete = async (type: 'deadline' | 'schedule') => {
        const ids = type === 'deadline' ? selectedDeadlines : selectedSchedules;
        if (!ids.length) return;
        
        if (!window.confirm(`Are you sure you want to delete ${ids.length} items?`)) return;

        try {
            const table = type === 'deadline' ? 'deadlines' : 'planning_schedules';
            if (supabase) {
                const { error } = await supabase.from(table).delete().in('id', ids);
                if (error) throw error;
            }
            
            if (type === 'deadline') {
                setDeadlines(prev => prev.filter(d => !ids.includes(d.id)));
                setSelectedDeadlines([]);
            } else {
                setPlanningSchedules(prev => prev.filter(s => !ids.includes(s.id)));
                setSelectedSchedules([]);
            }
        } catch (error: any) {
            console.error("Error bulk deleting:", error);
            alert("Failed to delete items.");
        }
    };

    const openDeadlineModal = (deadline?: Deadline) => {
        if (deadline) {
            setEditingDeadline(deadline);
            setDeadlineForm({ name: deadline.name, date: deadline.date });
        } else {
            setEditingDeadline(null);
            setDeadlineForm({ name: '', date: '' });
        }
        setIsDeadlineModalOpen(true);
    };

    const openScheduleModal = (schedule?: PlanningSchedule) => {
        if (schedule) {
            setEditingSchedule(schedule);
            setScheduleForm({ name: schedule.name, startDate: schedule.startDate, endDate: schedule.endDate });
        } else {
            setEditingSchedule(null);
            setScheduleForm({ name: '', startDate: '', endDate: '' });
        }
        setIsScheduleModalOpen(true);
    };

    const handleDeadlineSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!deadlineForm.name || !deadlineForm.date) return;

        try {
            if (editingDeadline) {
                if (supabase) {
                    const { data, error } = await supabase.from('deadlines').update(deadlineForm).eq('id', editingDeadline.id).select().single();
                    if (error) throw error;
                    if (data) setDeadlines(prev => prev.map(d => d.id === editingDeadline.id ? data : d));
                } else {
                    setDeadlines(prev => prev.map(d => d.id === editingDeadline.id ? { ...d, ...deadlineForm } : d));
                }
            } else {
                if (supabase) {
                    const { data, error } = await supabase.from('deadlines').insert([deadlineForm]).select().single();
                    if (error) throw error;
                    if (data) setDeadlines(prev => [...prev, data]);
                } else {
                    setDeadlines(prev => [...prev, { id: Date.now(), ...deadlineForm }]);
                }
            }
            setIsDeadlineModalOpen(false);
        } catch (error: any) {
            console.error("Error saving deadline:", error);
            alert("Failed to save deadline: " + error.message);
        }
    };

    const handleScheduleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!scheduleForm.name || !scheduleForm.startDate || !scheduleForm.endDate) return;

        try {
            if (editingSchedule) {
                if (supabase) {
                    const { data, error } = await supabase.from('planning_schedules').update(scheduleForm).eq('id', editingSchedule.id).select().single();
                    if (error) throw error;
                    if (data) setPlanningSchedules(prev => prev.map(s => s.id === editingSchedule.id ? data : s));
                } else {
                    setPlanningSchedules(prev => prev.map(s => s.id === editingSchedule.id ? { ...s, ...scheduleForm } : s));
                }
            } else {
                if (supabase) {
                    const { data, error } = await supabase.from('planning_schedules').insert([scheduleForm]).select().single();
                    if (error) throw error;
                    if (data) setPlanningSchedules(prev => [...prev, data]);
                } else {
                    setPlanningSchedules(prev => [...prev, { id: Date.now(), ...scheduleForm }]);
                }
            }
            setIsScheduleModalOpen(false);
        } catch (error: any) {
            console.error("Error saving schedule:", error);
            alert("Failed to save schedule: " + error.message);
        }
    };

    const getSortedDeadlines = useMemo(() => {
        if (!deadlineSort) return deadlines;
        return [...deadlines].sort((a, b) => {
            const aVal = a[deadlineSort.key];
            const bVal = b[deadlineSort.key];
            if (aVal < bVal) return deadlineSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return deadlineSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [deadlines, deadlineSort]);

    const getSortedSchedules = useMemo(() => {
        if (!scheduleSort) return planningSchedules;
        return [...planningSchedules].sort((a, b) => {
            const aVal = a[scheduleSort.key];
            const bVal = b[scheduleSort.key];
            if (aVal < bVal) return scheduleSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return scheduleSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [planningSchedules, scheduleSort]);

    const SortableHeader = ({ label, sortKey, type }: { label: string, sortKey: string, type: 'deadline' | 'schedule' }) => {
        const currentSort = type === 'deadline' ? deadlineSort : scheduleSort;
        const isSorted = currentSort?.key === sortKey;
        const directionIcon = isSorted ? (currentSort?.direction === 'asc' ? '▲' : '▼') : '↕';
        
        return (
            <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none group"
                onClick={() => handleSort(sortKey, type)}
            >
                <div className="flex items-center gap-1">
                    {label}
                    <span className={`text-gray-400 group-hover:text-gray-600 ${isSorted ? 'text-accent opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {directionIcon}
                    </span>
                </div>
            </th>
        );
    };

    return (
        <div className="space-y-12">
            
            {/* 1. Deadlines Management */}
            <section>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">System Deadlines</h3>
                    <div className="flex gap-2">
                        {selectedDeadlines.length > 0 && (
                            <button 
                                onClick={() => handleBulkDelete('deadline')}
                                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 flex items-center gap-2"
                            >
                                Delete Selected ({selectedDeadlines.length})
                            </button>
                        )}
                        <button 
                            onClick={() => openDeadlineModal()} 
                            className="px-4 py-2 bg-accent text-white rounded-md text-sm hover:bg-opacity-90"
                        >
                            + Add Deadline
                        </button>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-3 text-left w-12">
                                        <input 
                                            type="checkbox" 
                                            onChange={(e) => handleSelectAll(e, 'deadline')}
                                            checked={deadlines.length > 0 && selectedDeadlines.length === deadlines.length}
                                            className="rounded border-gray-300 text-accent focus:ring-accent"
                                        />
                                    </th>
                                    <SortableHeader label="Name" sortKey="name" type="deadline" />
                                    <SortableHeader label="Date" sortKey="date" type="deadline" />
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {getSortedDeadlines.length === 0 ? (
                                    <tr><td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500 italic">No deadlines set.</td></tr>
                                ) : (
                                    getSortedDeadlines.map(d => (
                                        <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-4 py-4">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedDeadlines.includes(d.id)}
                                                    onChange={() => handleSelectRow(d.id, 'deadline')}
                                                    className="rounded border-gray-300 text-accent focus:ring-accent"
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{d.name}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{d.date}</td>
                                            <td className="px-6 py-4 text-right text-sm font-medium">
                                                <button onClick={() => openDeadlineModal(d)} className="text-accent hover:text-green-900 mr-4">Edit</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* 2. Planning Schedules Management */}
            <section>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">Planning Schedules</h3>
                    <div className="flex gap-2">
                        {selectedSchedules.length > 0 && (
                            <button 
                                onClick={() => handleBulkDelete('schedule')}
                                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 flex items-center gap-2"
                            >
                                Delete Selected ({selectedSchedules.length})
                            </button>
                        )}
                        <button 
                            onClick={() => openScheduleModal()} 
                            className="px-4 py-2 bg-accent text-white rounded-md text-sm hover:bg-opacity-90"
                        >
                            + Add Schedule
                        </button>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-3 text-left w-12">
                                        <input 
                                            type="checkbox" 
                                            onChange={(e) => handleSelectAll(e, 'schedule')}
                                            checked={planningSchedules.length > 0 && selectedSchedules.length === planningSchedules.length}
                                            className="rounded border-gray-300 text-accent focus:ring-accent"
                                        />
                                    </th>
                                    <SortableHeader label="Event Name" sortKey="name" type="schedule" />
                                    <SortableHeader label="Start Date" sortKey="startDate" type="schedule" />
                                    <SortableHeader label="End Date" sortKey="endDate" type="schedule" />
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {getSortedSchedules.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500 italic">No schedules set.</td></tr>
                                ) : (
                                    getSortedSchedules.map(s => (
                                        <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-4 py-4">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedSchedules.includes(s.id)}
                                                    onChange={() => handleSelectRow(s.id, 'schedule')}
                                                    className="rounded border-gray-300 text-accent focus:ring-accent"
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{s.name}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{s.startDate}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{s.endDate}</td>
                                            <td className="px-6 py-4 text-right text-sm font-medium">
                                                <button onClick={() => openScheduleModal(s)} className="text-accent hover:text-green-900 mr-4">Edit</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* Modals */}
            {isDeadlineModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            {editingDeadline ? 'Edit Deadline' : 'Add New Deadline'}
                        </h3>
                        <form onSubmit={handleDeadlineSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                                <input type="text" required value={deadlineForm.name} onChange={e => setDeadlineForm({...deadlineForm, name: e.target.value})} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
                                <input type="date" required value={deadlineForm.date} onChange={e => setDeadlineForm({...deadlineForm, date: e.target.value})} className={commonInputClasses} />
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={() => setIsDeadlineModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600">
                                    Cancel
                                </button>
                                <button type="submit" className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-opacity-90">
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
             )}

             {isScheduleModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            {editingSchedule ? 'Edit Schedule' : 'Add New Schedule'}
                        </h3>
                        <form onSubmit={handleScheduleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Event Name</label>
                                <input type="text" required value={scheduleForm.name} onChange={e => setScheduleForm({...scheduleForm, name: e.target.value})} className={commonInputClasses} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date</label>
                                    <input type="date" required value={scheduleForm.startDate} onChange={e => setScheduleForm({...scheduleForm, startDate: e.target.value})} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">End Date</label>
                                    <input type="date" required value={scheduleForm.endDate} onChange={e => setScheduleForm({...scheduleForm, endDate: e.target.value})} className={commonInputClasses} />
                                </div>
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={() => setIsScheduleModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600">
                                    Cancel
                                </button>
                                <button type="submit" className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-opacity-90">
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
             )}
        </div>
    );
};

export default SystemManagementTab;
