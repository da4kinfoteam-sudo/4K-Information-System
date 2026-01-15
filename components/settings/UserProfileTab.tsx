
// Author: 4K
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../constants';

interface UserProfileTabProps {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
}

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

const UserProfileTab: React.FC<UserProfileTabProps> = ({ isDarkMode, toggleDarkMode }) => {
    const { currentUser, setUsersList, login } = useAuth();
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
        setUsersList(prev => prev.map(u => u.id === profileData.id ? profileData : u));
        login(profileData);
        alert("Profile updated successfully!");
    };

    if (!profileData) return null;

    return (
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
    );
};

export default UserProfileTab;
