// Author: AI
// OS support: Any
// Description: User settings page component with Profile and User Management tabs

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, operatingUnits } from '../constants';

interface SettingsProps {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
}

const Settings: React.FC<SettingsProps> = ({ isDarkMode, toggleDarkMode }) => {
    const { currentUser, usersList, setUsersList, login } = useAuth();
    const [activeTab, setActiveTab] = useState<'profile' | 'management'>('profile');
    
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

    // Profile Update State
    const [profileData, setProfileData] = useState<User | null>(null);

    useEffect(() => {
        if (currentUser) {
            setProfileData(currentUser);
        }
    }, [currentUser]);

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

    // CRUD Handlers
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

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

    if (!profileData) return null;

    return (
        <div className="max-w-6xl mx-auto animate-fadeIn">
             <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">User Settings</h2>

             <div className="bg-white dark:bg-gray-800 shadow rounded-lg mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
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
                    </nav>
                </div>

                <div className="p-6">
                    {activeTab === 'profile' ? (
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
                    ) : (
                        currentUser?.role === 'Administrator' && (
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
                        )
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