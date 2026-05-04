// Author: 4K
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../constants';
import { supabase } from '../../supabaseClient';
import { User as UserIcon, ShieldCheck, Mail, Key, Eye, EyeOff, Save, Moon, Sun } from 'lucide-react';

interface UserProfileTabProps {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
}

const commonInputClasses = "mt-1 block w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all sm:text-sm";

const UserProfileTab: React.FC<UserProfileTabProps> = ({ isDarkMode, toggleDarkMode }) => {
    const { currentUser, setUsersList, login } = useAuth();
    const [profileData, setProfileData] = useState<User | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (currentUser) {
            setProfileData({ ...currentUser });
        }
    }, [currentUser]);

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (!profileData) return;
        const { name, value } = e.target;
        setProfileData(prev => prev ? ({ ...prev, [name]: value }) : null);
    };

    const handleSaveProfile = async () => {
        if (!profileData) return;
        setSaving(true);

        if (supabase) {
            try {
                const { error } = await supabase
                    .from('users')
                    .update({
                        username: profileData.username,
                        fullName: profileData.fullName,
                        email: profileData.email,
                        password: profileData.password
                    })
                    .eq('id', profileData.id);

                if (error) {
                    console.error("Error updating profile in database:", error);
                    alert("Failed to update profile: " + error.message);
                    setSaving(false);
                    return;
                }
            } catch (error: any) {
                console.error("Error updating profile:", error);
                alert("An unexpected error occurred: " + error.message);
                setSaving(false);
                return;
            }
        }

        setUsersList(prev => prev.map(u => u.id === profileData.id ? profileData : u));
        login(profileData);
        setSaving(false);
        alert("Success: Your profile and account credentials have been updated.");
    };

    if (!profileData) return null;

    return (
        <div className="max-w-4xl space-y-8 pb-12">
            <div className="flex flex-col md:flex-row gap-8 items-start">
                {/* Left Column: Personal Info */}
                <div className="flex-1 space-y-6">
                    <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600">
                                <UserIcon className="h-5 w-5" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Personal Identity</h3>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Full Name</label>
                                <input type="text" name="fullName" value={profileData.fullName} onChange={handleProfileChange} className={commonInputClasses} placeholder="Your display name" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Username</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">@</span>
                                    <input type="text" name="username" value={profileData.username || ''} onChange={handleProfileChange} className={`${commonInputClasses} pl-8`} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input type="email" name="email" value={profileData.email} onChange={handleProfileChange} className={`${commonInputClasses} pl-10`} />
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400">
                                <Key className="h-5 w-5" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Account Security</h3>
                        </div>
                        
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Change your system password. Changes take effect immediately upon saving.</p>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Update Password</label>
                                <div className="relative">
                                    <input 
                                        type={showPassword ? "text" : "password"} 
                                        name="password" 
                                        value={profileData.password || ''} 
                                        onChange={handleProfileChange} 
                                        className={commonInputClasses} 
                                        placeholder="Enter new password"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Right Column: Roles & Appearance */}
                <div className="w-full md:w-80 space-y-6">
                    <section className="bg-gray-50 dark:bg-gray-800/40 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-3 mb-4">
                            <ShieldCheck className="h-5 w-5 text-gray-400" />
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Access Level</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                                <p className="text-[10px] font-black text-gray-400 uppercase">System Role</p>
                                <p className="text-sm font-bold text-emerald-600">{profileData.role}</p>
                            </div>
                            <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                                <p className="text-[10px] font-black text-gray-400 uppercase">Operating Unit</p>
                                <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{profileData.operatingUnit}</p>
                            </div>
                        </div>
                    </section>

                    <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Interface Preferences</h3>
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                {isDarkMode ? <Moon className="h-4 w-4 text-emerald-600" /> : <Sun className="h-4 w-4 text-amber-500" />}
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Dark Interface</span>
                            </div>
                            <button 
                                onClick={toggleDarkMode}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isDarkMode ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                            >
                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition duration-200 ${isDarkMode ? 'translate-x-4.5' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </section>
                    
                    <button 
                        onClick={handleSaveProfile} 
                        disabled={saving}
                        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white font-bold text-sm transition-all shadow-lg active:scale-95 ${saving ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'}`}
                    >
                        <Save className="h-4 w-4" />
                        {saving ? 'Updating...' : 'Save All Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserProfileTab;