
// Author: 4K 
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, operatingUnits, SystemSettings, Deadline, PlanningSchedule } from '../constants';
import { supabase } from '../supabaseClient';

interface SettingsProps {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    systemSettings: SystemSettings;
    setSystemSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;
}

const Settings: React.FC<SettingsProps> = ({ isDarkMode, toggleDarkMode, systemSettings, setSystemSettings }) => {
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

    // System Management Form State
    const [deadlineForm, setDeadlineForm] = useState({ name: '', date: '' });
    const [scheduleForm, setScheduleForm] = useState({ name: '', startDate: '', endDate: '' });
    
    const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);
    const [editingSchedule, setEditingSchedule] = useState<PlanningSchedule | null>(null);

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
            
            // Simple query to check connection
            const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
            
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

    const handleSubmitUser = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingUser) {
            setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...formData } : u));
        } else {
            const newUser = {
                id: Date.now(),
                ...formData
            } as User;
            setUsersList(prev => [...prev, newUser]);
        }
        setIsModalOpen(false);
    };

    // CRUD Handlers for System Settings
    const handleDeadlineSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!deadlineForm.name || !deadlineForm.date) return;

        if (editingDeadline) {
            setSystemSettings(prev => ({
                ...prev,
                deadlines: prev.deadlines.map(d => d.id === editingDeadline.id ? { ...d, ...deadlineForm } : d)
            }));
            setEditingDeadline(null);
        } else {
            const newDeadline: Deadline = { id: Date.now(), ...deadlineForm };
            setSystemSettings(prev => ({ ...prev, deadlines: [...prev.deadlines, newDeadline] }));
        }
        setDeadlineForm({ name: '', date: '' });
    };

    const handleEditDeadline = (deadline: Deadline) => {
        setEditingDeadline(deadline);
        setDeadlineForm({ name: deadline.name, date: deadline.date });
    };

    const handleCancelDeadlineEdit = () => {
        setEditingDeadline(null);
        setDeadlineForm({ name: '', date: '' });
    };

    const handleDeleteDeadline = (id: number) => {
        setSystemSettings(prev => ({ ...prev, deadlines: prev.deadlines.filter(d => d.id !== id) }));
        if (editingDeadline?.id === id) {
            handleCancelDeadlineEdit();
        }
    };

    const handleScheduleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!scheduleForm.name || !scheduleForm.startDate || !scheduleForm.endDate) return;

        if (editingSchedule) {
            setSystemSettings(prev => ({
                ...prev,
                planningSchedules: prev.planningSchedules.map(s => s.id === editingSchedule.id ? { ...s, ...scheduleForm } : s)
            }));
            setEditingSchedule(null);
        } else {
            const newSchedule: PlanningSchedule = { id: Date.now(), ...scheduleForm };
            setSystemSettings(prev => ({ ...prev, planningSchedules: [...prev.planningSchedules, newSchedule] }));
        }
        setScheduleForm({ name: '', startDate: '', endDate: '' });
    };

    const handleEditSchedule = (schedule: PlanningSchedule) => {
        setEditingSchedule(schedule);
        setScheduleForm({ name: schedule.name, startDate: schedule.startDate, endDate: schedule.endDate });
    };

    const handleCancelScheduleEdit = () => {
        setEditingSchedule(null);
        setScheduleForm({ name: '', startDate: '', endDate: '' });
    };

    const handleDeleteSchedule = (id: number) => {
        setSystemSettings(prev => ({ ...prev, planningSchedules: prev.planningSchedules.filter(s => s.id !== id) }));
        if (editingSchedule?.id === id) {
            handleCancelScheduleEdit();
        }
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
                {connectionStatus === 'error' && (
                    <p className="text-xs text-gray-500 mt-3 ml-1">
                        If connection fails, please ensure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_KEY</code> are correctly set in your Vercel Project Settings.
                    </p>
                )}
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
                        <div className="space-y-10">
                            {/* Deadlines Section */}
                            <div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">System Deadlines</h3>
                                <div className="flex flex-col md:flex-row gap-6">
                                    <div className="flex-1">
                                        <form onSubmit={handleDeadlineSubmit} className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{editingDeadline ? 'Edit Deadline' : 'Add New Deadline'}</h4>
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
                                                    <input type="text" required value={deadlineForm.name} onChange={e => setDeadlineForm({...deadlineForm, name: e.target.value})} className={commonInputClasses} />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Date</label>
                                                    <input type="date" required value={deadlineForm.date} onChange={e => setDeadlineForm({...deadlineForm, date: e.target.value})} className={commonInputClasses} />
                                                </div>
                                                <div className="flex gap-2">
                                                    {editingDeadline && (
                                                        <button type="button" onClick={handleCancelDeadlineEdit} className="flex-1 py-2 px-4 bg-gray-300 text-gray-800 text-sm font-medium rounded-md hover:bg-gray-400">Cancel</button>
                                                    )}
                                                    <button type="submit" className="flex-1 py-2 px-4 bg-accent text-white text-sm font-medium rounded-md hover:bg-opacity-90">
                                                        {editingDeadline ? 'Update' : 'Add'}
                                                    </button>
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                    <div className="flex-[2]">
                                        {systemSettings.deadlines.length > 0 ? (
                                            <ul className="space-y-2">
                                                {systemSettings.deadlines.map(d => (
                                                    <li key={d.id} className="flex justify-between items-center p-3 bg-white dark:bg-gray-700 rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
                                                        <div>
                                                            <span className="font-medium text-gray-900 dark:text-white block">{d.name}</span>
                                                            <span className="text-sm text-gray-500 dark:text-gray-400">{d.date}</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => handleEditDeadline(d)} className="text-accent hover:text-green-700 text-sm font-medium">Edit</button>
                                                            <button onClick={() => handleDeleteDeadline(d.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">Delete</button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No deadlines set.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Planning Schedules Section */}
                            <div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Planning Schedules</h3>
                                <div className="flex flex-col md:flex-row gap-6">
                                    <div className="flex-1">
                                        <form onSubmit={handleScheduleSubmit} className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{editingSchedule ? 'Edit Schedule' : 'Add New Schedule'}</h4>
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
                                                    <input type="text" required value={scheduleForm.name} onChange={e => setScheduleForm({...scheduleForm, name: e.target.value})} className={commonInputClasses} />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Start Date</label>
                                                        <input type="date" required value={scheduleForm.startDate} onChange={e => setScheduleForm({...scheduleForm, startDate: e.target.value})} className={commonInputClasses} />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">End Date</label>
                                                        <input type="date" required value={scheduleForm.endDate} onChange={e => setScheduleForm({...scheduleForm, endDate: e.target.value})} className={commonInputClasses} />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    {editingSchedule && (
                                                        <button type="button" onClick={handleCancelScheduleEdit} className="flex-1 py-2 px-4 bg-gray-300 text-gray-800 text-sm font-medium rounded-md hover:bg-gray-400">Cancel</button>
                                                    )}
                                                    <button type="submit" className="flex-1 py-2 px-4 bg-accent text-white text-sm font-medium rounded-md hover:bg-opacity-90">
                                                        {editingSchedule ? 'Update' : 'Add'}
                                                    </button>
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                    <div className="flex-[2]">
                                        {systemSettings.planningSchedules.length > 0 ? (
                                            <ul className="space-y-2">
                                                {systemSettings.planningSchedules.map(s => (
                                                    <li key={s.id} className="flex justify-between items-center p-3 bg-white dark:bg-gray-700 rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
                                                        <div>
                                                            <span className="font-medium text-gray-900 dark:text-white block">{s.name}</span>
                                                            <span className="text-sm text-gray-500 dark:text-gray-400">{s.startDate} to {s.endDate}</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => handleEditSchedule(s)} className="text-accent hover:text-green-700 text-sm font-medium">Edit</button>
                                                            <button onClick={() => handleDeleteSchedule(s.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">Delete</button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No planning schedules set.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
             </div>
             
             {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            {editingUser ? 'Edit User' : 'Add New User'}
                        </h3>
                        <form onSubmit={handleSubmitUser} className="space-y-4">
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
        </div>
    );
};

export default Settings;
// --- End of components/Settings.tsx ---
