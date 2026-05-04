// Author: 4K 
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User, operatingUnits, appModules, RoleConfig } from '../../constants';
import { supabase } from '../../supabaseClient';
import { Shield, Save, X as XIcon, Info, Users, UserCog } from 'lucide-react';

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm";

const UserManagementTab: React.FC = () => {
    const { usersList, setUsersList } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState<Omit<User, 'id'>>({
        username: '',
        fullName: '',
        email: '',
        role: 'User',
        operatingUnit: 'NPMO',
        password: '',
        visibility_scope: undefined,
        requires_approver: false,
        approver_id: null
    });

    const [userOverrides, setUserOverrides] = useState<any>({});
    const [roleDefaults, setRoleDefaults] = useState<RoleConfig[]>([]);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const handleAddUser = () => {
        setEditingUser(null);
        setFormError(null);
        setFormData({ 
            username: '', fullName: '', email: '', role: 'User', operatingUnit: 'NPMO', password: '', 
            visibility_scope: undefined, requires_approver: false, approver_id: null 
        });
        setIsModalOpen(true);
    };

    const handleEditUser = (user: User) => {
        setEditingUser(user);
        setFormError(null);
        setFormData({
            username: user.username || '',
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            operatingUnit: user.operatingUnit,
            password: user.password || '',
            visibility_scope: user.visibility_scope || undefined,
            requires_approver: user.requires_approver || false,
            approver_id: user.approver_id || null
        });
        setIsModalOpen(true);
    };

    const handleEditPermissions = async (user: User) => {
        setEditingUser(user);
        setUserOverrides(typeof user.permissions_override === 'object' && user.permissions_override !== null ? { ...user.permissions_override } : {});
        setIsPermissionModalOpen(true);
        
        if (supabase) {
            const { data } = await supabase.from('roles_config').select('*').eq('role', user.role);
            if (data) setRoleDefaults(data);
        }
    };

    const handleTogglePermission = (module: string, field: 'can_view' | 'can_edit' | 'can_delete') => {
        setUserOverrides((prev: any) => {
            const newOverrides = { ...prev };
            if (!newOverrides[module]) {
                newOverrides[module] = {};
            }
            
            const currentValue = newOverrides[module][field] !== undefined 
                ? newOverrides[module][field] 
                : (roleDefaults.find(r => r.module === module)?.[field] || false);
                
            newOverrides[module][field] = !currentValue;

            if (field === 'can_view' && !newOverrides[module].can_view) {
                newOverrides[module].can_edit = false;
                newOverrides[module].can_delete = false;
            }
            if ((field === 'can_edit' || field === 'can_delete') && newOverrides[module][field]) {
                newOverrides[module].can_view = true;
            }

            return newOverrides;
        });
    };

    const handleClearOverride = (module: string) => {
        setUserOverrides((prev: any) => {
            const newOverrides = { ...prev };
            delete newOverrides[module];
            return newOverrides;
        });
    };

    const handleSavePermissions = async () => {
        if (!editingUser || !supabase) return;
        setSaving(true);
        
        try {
            const { error } = await supabase
                .from('users')
                .update({ permissions_override: userOverrides })
                .eq('id', editingUser.id);

            if (error) throw error;
            
            setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, permissions_override: userOverrides } : u));
            setIsPermissionModalOpen(false);
            alert("User permissions successfully updated.");
        } catch (e: any) {
            console.error("Save overrides exception:", e);
            alert("Failed to save permissions: " + e.message);
        }
        setSaving(false);
    };

    const handleDeleteUser = async (id: number) => {
        if (window.confirm("Are you sure you want to delete this user?")) {
            if (supabase) {
                try {
                    const { error } = await supabase.from('users').delete().eq('id', id);
                    if (error) {
                        console.error("Error deleting user:", error);
                        alert("Failed to delete user from database.");
                        return;
                    }
                } catch (e) {
                    console.error("Delete exception:", e);
                }
            }
            setUsersList(prev => prev.filter(u => u.id !== id));
        }
    };

    const handleSubmitUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        setSaving(true);
        
        const payloadToSave = { ...formData };
        if (!payloadToSave.password || payloadToSave.password.trim() === '') {
            delete payloadToSave.password;
        }
        
        if (editingUser) {
            if (supabase) {
                try {
                    const { error } = await supabase
                        .from('users')
                        .update(payloadToSave)
                        .eq('id', editingUser.id);

                    if (error) {
                        console.error("Error updating user:", error);
                        setFormError("Failed to update user in database. Check RLS policies.");
                        setSaving(false);
                        return;
                    }
                } catch (e: any) {
                    console.error("Update exception:", e);
                    setFormError("An error occurred: " + e.message);
                    setSaving(false);
                    return;
                }
            }
            setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...formData } : u));
            setSaving(false);
            setIsModalOpen(false);
        } else {
            if (supabase) {
                try {
                    const { id, ...insertPayload } = payloadToSave as any;
                    const { error } = await supabase.from('users').insert([insertPayload]);
                    
                    if (error) {
                        if (error.message.includes('row-level security policy')) {
                            setFormError("RLS Permission Error: Add policy to allow INSERT on 'users' table.");
                            setSaving(false);
                            return;
                        }
                        setFormError("Failed to add user: " + error.message);
                        setSaving(false);
                        return;
                    }

                    const { data: refreshedList, error: fetchError } = await supabase
                        .from('users')
                        .select('*')
                        .order('id', { ascending: true });
                    
                    if (fetchError) console.error(fetchError);

                    if (refreshedList) {
                        setUsersList(refreshedList as User[]); 
                    } else {
                        setUsersList(prev => [...prev, { id: Date.now(), ...formData } as User]);
                    }
                    
                    setSaving(false);
                    setIsModalOpen(false);
                } catch (err: any) {
                    console.error("Error adding user:", err);
                    setFormError("Exception: " + err.message);
                    setSaving(false);
                    return;
                }
            } else {
                const newUser = { id: Date.now(), ...formData } as User;
                setUsersList(prev => [...prev, newUser]);
                setSaving(false);
                setIsModalOpen(false);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-emerald-100 dark:border-emerald-700/50 shadow-sm">
                <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Users className="h-6 w-6 text-emerald-600" />
                        System User Directory
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage system identities, permissions, and security overrides.</p>
                </div>
                <button onClick={handleAddUser} className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-semibold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md active:scale-95">
                    + Add New User
                </button>
            </div>

            <div className="bg-white dark:bg-gray-900 overflow-hidden shadow-sm ring-1 ring-gray-200 dark:ring-gray-700/50 sm:rounded-xl">
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-200 dark:scrollbar-thumb-emerald-900">
                    <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                        <thead className="bg-[#f8fafc] dark:bg-gray-850 sticky top-0 z-20">
                            <tr>
                                <th className="px-3 py-2 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-800">User Identity</th>
                                <th className="px-3 py-2 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-800">Access & Org</th>
                                <th className="px-3 py-2 text-center text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-800">Visibility Control</th>
                                <th className="px-3 py-2 text-right text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-800">Operations</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {usersList.map(user => {
                                const hasOverrides = user.permissions_override && Object.keys(user.permissions_override).length > 0;
                                return (
                                    <tr key={user.id} className="hover:bg-emerald-50/10 dark:hover:bg-emerald-900/10 transition-colors group">
                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-md bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-black text-[9px]">
                                                    {user.fullName.substring(0, 1).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[11px] font-bold text-gray-900 dark:text-gray-100 truncate max-w-[140px] tracking-tight">{user.fullName}</div>
                                                    <div className="text-[9px] text-gray-400 dark:text-gray-500 truncate max-w-[140px]">@{user.username}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">
                                                    {user.role}
                                                </span>
                                                <div className="text-[9px] font-medium text-gray-500 dark:text-gray-500">{user.operatingUnit}</div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                            <div className="flex flex-col items-center">
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter border ${user.visibility_scope === 'Own OU' ? 'bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-900/10 dark:border-amber-800' : 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/10 dark:border-emerald-800'}`}>
                                                    {user.visibility_scope === 'Own OU' ? 'Restricted' : 'Universal'}
                                                </span>
                                                {hasOverrides && (
                                                    <span className="text-[7px] font-black text-amber-600 dark:text-amber-400 mt-0.5 animate-pulse">CUSTOM RULES</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-1.5 whitespace-nowrap text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button 
                                                    onClick={() => handleEditPermissions(user)} 
                                                    className="p-1 px-1.5 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-1" 
                                                    title="Surgical Permissions"
                                                >
                                                    <Shield className="h-3 w-3" />
                                                    <span className="text-[8px] font-bold">ACL</span>
                                                </button>
                                                <button 
                                                    onClick={() => handleEditUser(user)} 
                                                    className="px-2 py-1 text-[9px] font-bold text-gray-600 dark:text-gray-300 hover:bg-emerald-600 hover:text-white rounded border border-gray-200 dark:border-gray-700 hover:border-emerald-600 transition-all uppercase"
                                                >
                                                    Edit
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteUser(user.id)} 
                                                    className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded hover:bg-red-50 dark:hover:bg-red-950/20"
                                                >
                                                    <XIcon className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {isPermissionModalOpen && editingUser && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] max-w-4xl w-full flex flex-col max-h-[90vh] border border-gray-100 dark:border-gray-700">
                        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2 tracking-tight">
                                    <Shield className="h-6 w-6 text-emerald-600" />
                                    Access Overrides
                                </h3>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">
                                    {editingUser.fullName} • <span className="text-emerald-600">{editingUser.role}</span>
                                </p>
                            </div>
                            <button onClick={() => setIsPermissionModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                                <XIcon className="h-6 w-6 text-gray-400" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/50 flex items-start gap-3 mb-8">
                                <Info className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-gray-600 dark:text-gray-300">
                                    <p className="font-bold text-gray-900 dark:text-white mb-1">Hierarchy Logic</p>
                                    <p>Overrides defined here supersede role-level permissions. These are surgical controls for this specific account only.</p>
                                </div>
                            </div>
                            
                            <div className="overflow-hidden border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm">
                                <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                                    <thead className="bg-[#fcfdfe] dark:bg-gray-850">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Target Module</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest w-32">View</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest w-32">Edit</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest w-32">Delete</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                        {appModules.map(module => {
                                            const roleDefault = roleDefaults.find(r => r.module === module) || { can_view: false, can_edit: false, can_delete: false };
                                            const hasOverride = userOverrides[module] !== undefined;
                                            const effectiveConfig = hasOverride ? userOverrides[module] : roleDefault;
                                            
                                            const Toggle = ({ field }: { field: 'can_view'|'can_edit'|'can_delete' }) => {
                                                const val = effectiveConfig[field];
                                                const accentColor = field === 'can_view' ? 'bg-emerald-600' : field === 'can_edit' ? 'bg-amber-500' : 'bg-red-500';
                                                
                                                return (
                                                    <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                        <div className={`w-10 h-5 rounded-full relative transition-all ${val ? accentColor : 'bg-gray-200 dark:bg-gray-700'}`}>
                                                            <span className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform ${val ? 'translate-x-5' : 'translate-x-0'} shadow-sm`}></span>
                                                        </div>
                                                        <input 
                                                            type="checkbox" 
                                                            className="hidden"
                                                            checked={val}
                                                            onChange={() => handleTogglePermission(module, field)}
                                                        />
                                                    </label>
                                                );
                                            };

                                            return (
                                                <tr key={module} className={`hover:bg-emerald-50/10 dark:hover:bg-emerald-900/10 transition-colors ${hasOverride ? 'bg-emerald-50/5 dark:bg-emerald-900/5' : ''}`}>
                                                    <td className="px-6 py-4 text-sm font-bold text-gray-800 dark:text-white">
                                                        {module}
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        {hasOverride ? (
                                                            <div className="flex flex-col items-center">
                                                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 mb-1">
                                                                    OVERRIDDEN
                                                                </span>
                                                                <button onClick={() => handleClearOverride(module)} className="text-[9px] font-bold text-gray-400 hover:text-red-500 underline uppercase tracking-tighter">Reset</button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-400 font-medium">Auto (Default)</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4"><div className="flex justify-center"><Toggle field="can_view" /></div></td>
                                                    <td className="px-4 py-4"><div className="flex justify-center"><Toggle field="can_edit" /></div></td>
                                                    <td className="px-4 py-4"><div className="flex justify-center"><Toggle field="can_delete" /></div></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                            <button onClick={() => setIsPermissionModalOpen(false)} className="px-6 py-2.5 font-bold text-xs text-gray-500 hover:text-gray-800 transition-colors">CANCEL</button>
                            <button
                                onClick={handleSavePermissions}
                                disabled={saving}
                                className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-white text-xs font-black tracking-widest transition-all ${saving ? 'bg-gray-400' : 'bg-emerald-600 hover:shadow-emerald-600/30'}`}
                            >
                                <Save className="h-4 w-4" />
                                {saving ? 'SAVING...' : 'SAVE CONFIG'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 dark:border-gray-700">
                        <div className="p-6 bg-gray-50 dark:bg-gray-850/50 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight uppercase">
                                {editingUser ? 'Optimize Identity' : 'New System Entity'}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium italic">Configure core account properties and credentials.</p>
                        </div>
                        
                        {formError && (
                            <div className="mx-6 mt-6 bg-red-50 dark:bg-red-950/20 border-l-4 border-red-500 p-4 rounded-lg text-xs font-bold text-red-700 dark:text-red-400 animate-shake">
                                {formError}
                            </div>
                        )}

                        <form onSubmit={handleSubmitUser} className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Account Display Name</label>
                                    <input type="text" required value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className={commonInputClasses} placeholder="e.g. John Doe" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Username</label>
                                    <input type="text" required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className={commonInputClasses} placeholder="jdoe" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">System Password</label>
                                    <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className={commonInputClasses} placeholder="••••••••" />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Network Email</label>
                                <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className={commonInputClasses} placeholder="user@npmoms.com" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Authorization Role</label>
                                    <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})} className={commonInputClasses}>
                                        <option value="Super Admin">Super Admin</option>
                                        <option value="Administrator">Administrator</option>
                                        <option value="Management">Management</option>
                                        <option value="Focal - User">Focal - User</option>
                                        <option value="RFO - User">RFO - User</option>
                                        <option value="User">User</option>
                                        <option value="Guest">Guest</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Operating Unit</label>
                                    <select value={formData.operatingUnit} onChange={e => setFormData({...formData, operatingUnit: e.target.value})} className={commonInputClasses}>
                                        {operatingUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2 bg-emerald-50/50 dark:bg-emerald-900/10 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                                    <label className="block text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-1">Data Visibility scope (DCF Restriction)</label>
                                    <select 
                                        value={formData.visibility_scope || ''} 
                                        onChange={e => setFormData({...formData, visibility_scope: (e.target.value || undefined) as any})} 
                                        className={commonInputClasses}
                                    >
                                        <option value="">System Default (Base on Role)</option>
                                        <option value="All OUs">All OUs (Universal Access)</option>
                                        <option value="Own OU">Own OU (Restricted to Selected OU)</option>
                                    </select>
                                    <p className="text-[9px] text-gray-500 mt-1 italic font-medium">Override the role-level visibility settings for this specific user if necessary.</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-850 rounded-xl border border-gray-100 dark:border-gray-700">
                                <div>
                                    <p className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Workflow Bridge</p>
                                    <p className="text-[10px] text-gray-500 font-medium tracking-tight">Require approvals for high-level events</p>
                                </div>
                                <label className="relative inline-flex h-5 w-9 items-center rounded-full cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only"
                                        checked={formData.requires_approver || false} 
                                        onChange={e => setFormData({ ...formData, requires_approver: e.target.checked, approver_id: e.target.checked ? formData.approver_id : null })} 
                                    />
                                    <div className={`w-9 h-5 rounded-full transition-colors ${formData.requires_approver ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                        <span className={`block h-3.5 w-3.5 transform rounded-full bg-white transition-transform mt-0.75 ml-0.75 ${formData.requires_approver ? 'translate-x-4.5' : 'translate-x-0'}`} />
                                    </div>
                                </label>
                            </div>

                            {formData.requires_approver && (
                                <div className="animate-fade-in">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Assigned Approver</label>
                                    <select 
                                        value={formData.approver_id || ''} 
                                        onChange={e => setFormData({...formData, approver_id: e.target.value ? parseInt(e.target.value) : null})} 
                                        className={commonInputClasses}
                                    >
                                        <option value="">No specific parent</option>
                                        {usersList.filter(u => u.id !== editingUser?.id).map(user => (
                                            <option key={user.id} value={user.id}>{user.fullName}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 dark:border-gray-700 mt-2">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 font-bold text-[10px] text-gray-400 uppercase tracking-widest hover:text-gray-700 transition-colors">DISCARD</button>
                                <button type="submit" disabled={saving} className={`px-10 py-2.5 rounded-xl text-white text-[10px] font-bold uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all ${saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-emerald-600 hover:shadow-emerald-500/30'}`}>
                                    {saving ? 'SYNCING...' : 'COMMIT'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagementTab;
// --- End of UserManagementTab.tsx ---
