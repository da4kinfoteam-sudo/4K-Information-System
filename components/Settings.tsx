
// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, operatingUnits, SystemSettings, Deadline, PlanningSchedule } from '../constants';
import { supabase } from '../supabaseClient';

interface SettingsProps {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    deadlines: Deadline[];
    setDeadlines: React.Dispatch<React.SetStateAction<Deadline[]>>;
    planningSchedules: PlanningSchedule[];
    setPlanningSchedules: React.Dispatch<React.SetStateAction<PlanningSchedule[]>>;
}

// Local TrashIcon since it's used for UI actions
const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const Settings: React.FC<SettingsProps> = ({ 
    isDarkMode, toggleDarkMode, 
    deadlines, setDeadlines,
    planningSchedules, setPlanningSchedules
}) => {
    const { currentUser, usersList, setUsersList, login } = useAuth();
    const [activeTab, setActiveTab] = useState<'profile' | 'management' | 'system'>('profile');
    
    // System Health State
    const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
    const [latency, setLatency] = useState<number | null>(null);
    const [errorDetails, setErrorDetails] = useState<string>('');

    // User Management Form State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState<Omit<User, 'id'>>({
        username: '',
        fullName: '',
        email: '',
        role: 'User',
        operatingUnit: 'NPMO',
        password: ''
    });

    // --- System Management State (New) ---
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

    // Profile Update State
    const [profileData, setProfileData] = useState<User | null>(null);

    // Test Connection on Mount
    useEffect(() => {
        testConnection();
    }, []);

    useEffect(() => {
        if (currentUser) {
            setProfileData(currentUser);
        }
    }, [currentUser]);

    const testConnection = async () => {
        setConnectionStatus('checking');
        const start = performance.now();
        try {
            if (!supabase) throw new Error("Supabase client not initialized. Check VITE_SUPABASE_URL and VITE_SUPABASE_KEY.");
            
            // Robust check using standard select instead of HEAD
            const { error } = await supabase.from('users').select('id').limit(1);
            
            if (error) throw error;
            
            const end = performance.now();
            setLatency(Math.round(end - start));
            setConnectionStatus('connected');
            setErrorDetails('');
        } catch (err: any) {
            console.error("Connection Test Failed:", err);
            setConnectionStatus('error');
            setErrorDetails(err.message || 'Unknown network error');
            setLatency(null);
        }
    };

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (!profileData) return;
        const { name, value } = e.target;
        setProfileData(prev => prev ? ({ ...prev, [name]: value }) : null);
    };

    const handleSaveProfile = () => {
        if (!profileData) return;
        // Update the user in the master list
        setUsersList(prev => prev.map(u => u.id === profileData.id ? profileData : u));
        // Update current session
        login(profileData);
        alert("Profile updated successfully!");
    };

    // CRUD Handlers for Users
    const handleAddUser = () => {
        setEditingUser(null);
        setFormData({ username: '', fullName: '', email: '', role: 'User', operatingUnit: 'NPMO', password: '' });
        setIsModalOpen(true);
    };

    const handleEditUser = (user: User) => {
        setEditingUser(user);
        setFormData({
            username: user.username || '',
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            operatingUnit: user.operatingUnit,
            password: user.password || ''
        });
        setIsModalOpen(true);
    };

    const handleDeleteUser = (id: number) => {
        if (window.confirm("Are you sure you want to delete this user?")) {
            setUsersList(prev => prev.filter(u => u.id !== id));
        }
    };

    const handleSubmitUser = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (editingUser) {
            // Edit Mode: Update local state -> triggers Hook Upsert (works for existing records)
            setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...formData } : u));
        } else {
            // Add Mode
            if (supabase) {
                try {
                    // 1. Direct Insert to let DB generate ID (excludes ID from payload)
                    const { error } = await supabase.from('users').insert([formData]);
                    
                    if (error) {
                        if (error.message.includes('row-level security policy')) {
                            throw new Error("Database Permission Error. Please run the provided SQL setup script in your Supabase Dashboard to enable access.");
                        }
                        throw error;
                    }

                    // 2. Fetch updated list to sync local state with real IDs
                    const { data: refreshedList, error: fetchError } = await supabase
                        .from('users')
                        .select('*')
                        .order('id', { ascending: true });
                    
                    if (fetchError) throw fetchError;

                    if (refreshedList) {
                        setUsersList(refreshedList as User[]); 
                    }
                } catch (err: any) {
                    console.error("Error adding user:", err);
                    alert("Failed to add user: " + err.message);
                    return; // Keep modal open on error
                }
            } else {
                // Offline fallback
                const newUser = {
                    id: Date.now(),
                    ...formData
                } as User;
                setUsersList(prev => [...prev, newUser]);
            }
        }
        setIsModalOpen(false);
    };

    // --- System Settings Logic ---

    // 1. Sorting Helpers
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

    // 2. Selection Helpers
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

    // 3. Bulk Delete
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

    // 4. CRUD Handlers adapted for Modals
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

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

    if (!profileData) return null;

    const canAccessSystem = currentUser?.role === 'Administrator' || currentUser?.role === 'Management';

    return (
        <div className="max-w-6xl mx-auto animate-fadeIn pb-10">
             <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Settings</h2>

             {/* System Health Card */}
             <div className="bg-white dark:bg-gray-800 shadow rounded-lg mb-6 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        System Health
                    </h3>
                    <button 
                        onClick={testConnection} 
                        disabled={connectionStatus === 'checking'}
                        className="text-sm text-accent hover:underline disabled:opacity-50"
                    >
                        {connectionStatus === 'checking' ? 'Checking...' : 'Test Connection'}
                    </button>
                </div>
                
                <div className={`p-4 rounded-md border ${
                    connectionStatus === 'connected' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' :
                    connectionStatus === 'error' ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' :
                    'bg-gray-50 border-gray-200 dark:bg-gray-700/50 dark:border-gray-600'
                }`}>
                    <div className="flex items-center">
                        <div className={`flex-shrink-0 h-3 w-3 rounded-full mr-3 ${
                            connectionStatus === 'connected' ? 'bg-green-500' :
                            connectionStatus === 'error' ? 'bg-red-500' :
                            'bg-gray-400 animate-pulse'
                        }`}></div>
                        <div className="flex-1">
                            <p className={`text-sm font-bold ${
                                connectionStatus === 'connected' ? 'text-green-800 dark:text-green-300' :
                                connectionStatus === 'error' ? 'text-red-800 dark:text-red-300' :
                                'text-gray-800 dark:text-gray-300'
                            }`}>
                                {connectionStatus === 'connected' ? 'Connected to Database' :
                                 connectionStatus === 'error' ? 'Connection Failed' :
                                 'Checking Status...'}
                            </p>
                            {latency && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Latency: {latency}ms
                                </p>
                            )}
                            {errorDetails && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
                                    Error: {errorDetails}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
             </div>

             <div className="bg-white dark:bg-gray-800 shadow rounded-lg mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8 px-6 overflow-x-auto" aria-label="Tabs">
                         <button
                            onClick={() => setActiveTab('profile')}
                            className={`${activeTab === 'profile' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            User Profile
                        </button>
                        {currentUser?.role === 'Administrator' && (
                            <button
                                onClick={() => setActiveTab('management')}
                                className={`${activeTab === 'management' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                            >
                                Users Management
                            </button>
                        )}
                        {canAccessSystem && (
                            <button
                                onClick={() => setActiveTab('system')}
                                className={`${activeTab === 'system' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                            >
                                System Management
                            </button>
                        )}
                    </nav>
                </div>

                <div className="p-6">
                    {activeTab === 'profile' && (
                         <div className="space-y-6 max-w-2xl">
                            {/* Profile Form Content */}
                            <div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Personal Information</h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Update your account details.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                                <div className="sm:col-span-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
                                    <input type="text" name="username" value={profileData.username || ''} onChange={handleProfileChange} className={commonInputClasses} />
                                </div>
                                <div className="sm:col-span-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
                                    <input type="text" name="fullName" value={profileData.fullName} onChange={handleProfileChange} className={commonInputClasses} />
                                </div>
                                <div className="sm:col-span-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                                    <input type="email" name="email" value={profileData.email} onChange={handleProfileChange} className={commonInputClasses} />
                                </div>
                                <div className="sm:col-span-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                                    <input type="password" name="password" value={profileData.password || ''} onChange={handleProfileChange} className={commonInputClasses} />
                                </div>
                                <div className="sm:col-span-3">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                                    <input type="text" disabled value={profileData.role} className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} />
                                </div>
                                <div className="sm:col-span-3">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit</label>
                                    <input type="text" disabled value={profileData.operatingUnit} className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} />
                                </div>
                            </div>
                            <div className="pt-5">
                                <div className="flex justify-end">
                                    <button type="button" onClick={handleSaveProfile} className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                                        Save
                                    </button>
                                </div>
                            </div>
                            
                            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Appearance</h3>
                                <div className="mt-4 flex items-center justify-between">
                                    <div>
                                        <p className="font-medium text-gray-700 dark:text-gray-300">Dark Mode</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Toggle dark mode theme for the application.</p>
                                    </div>
                                    <button 
                                        onClick={toggleDarkMode}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${isDarkMode ? 'bg-accent' : 'bg-gray-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>
                         </div>
                    )}
                    
                    {activeTab === 'management' && currentUser?.role === 'Administrator' && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">System Users</h3>
                                <button onClick={handleAddUser} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-accent hover:bg-opacity-90">
                                    Add User
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Username</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Full Name</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Operating Unit</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {usersList.map(user => (
                                            <tr key={user.id}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{user.username}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.fullName}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.email}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.role}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.operatingUnit}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button onClick={() => handleEditUser(user)} className="text-accent hover:text-green-900 mr-4">Edit</button>
                                                    <button onClick={() => handleDeleteUser(user.id)} className="text-red-600 hover:text-red-900">Delete</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'system' && canAccessSystem && (
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
                        </div>
                    )}
                </div>
             </div>
             
             {/* User Modal */}
             {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            {editingUser ? 'Edit User' : 'Add New User'}
                        </h3>
                        <form onSubmit={handleSubmitUser} className="space-y-4">
                            {/* ... (User Form Fields same as before) ... */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
                                <input type="text" required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
                                <input type="text" required value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                                <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className={commonInputClasses} />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})} className={commonInputClasses}>
                                    <option value="Administrator">Administrator</option>
                                    <option value="User">User</option>
                                    <option value="Management">Management</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit</label>
                                <select value={formData.operatingUnit} onChange={e => setFormData({...formData, operatingUnit: e.target.value})} className={commonInputClasses}>
                                    {operatingUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                                </select>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                                <input type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className={commonInputClasses} placeholder="Leave blank to keep unchanged" />
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600">
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

             {/* Deadline Modal */}
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

             {/* Schedule Modal */}
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

export default Settings;
