import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User, operatingUnits, appModules, RoleConfig } from '../../constants';
import { supabase } from '../../supabaseClient';
import { Shield, Save, X as XIcon, Info, Users, UserCog } from 'lucide-react';

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

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
        password: ''
    });

    const [userOverrides, setUserOverrides] = useState<any>({});
    const [roleDefaults, setRoleDefaults] = useState<RoleConfig[]>([]);
    const [saving, setSaving] = useState(false);

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

    const handleEditPermissions = async (user: User) => {
        setEditingUser(user);
        setUserOverrides(typeof user.permissions_override === 'object' && user.permissions_override !== null ? { ...user.permissions_override } : {});
        setIsPermissionModalOpen(true);
        
        // Fetch role defaults for comparison
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
            
            // Toggle the value, or set it if it doesn't exist
            const currentValue = newOverrides[module][field] !== undefined 
                ? newOverrides[module][field] 
                : (roleDefaults.find(r => r.module === module)?.[field] || false);
                
            newOverrides[module][field] = !currentValue;

            // Dependent toggles logic
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
        
        if (editingUser) {
            // Update logic
            if (supabase) {
                try {
                    const { error } = await supabase
                        .from('users')
                        .update(formData)
                        .eq('id', editingUser.id);

                    if (error) {
                        console.error("Error updating user:", error);
                        alert("Failed to update user in database.");
                        return;
                    }
                } catch (e) {
                    console.error("Update exception:", e);
                    alert("An error occurred while updating user.");
                    return;
                }
            }
            setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...formData } : u));
        } else {
            // Create logic
            if (supabase) {
                try {
                    const { error } = await supabase.from('users').insert([formData]);
                    
                    if (error) {
                        if (error.message.includes('row-level security policy')) {
                            throw new Error("Database Permission Error.");
                        }
                        throw error;
                    }

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
                    return;
                }
            } else {
                const newUser = {
                    id: Date.now(),
                    ...formData
                } as User;
                setUsersList(prev => [...prev, newUser]);
            }
        }
        setIsModalOpen(false);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-accent" />
                    System Users
                </h3>
                <button onClick={handleAddUser} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-accent hover:bg-opacity-90 transition-colors">
                    Add User
                </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Username / Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Operating Unit</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Overrides</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {usersList.map(user => {
                            const hasOverrides = user.permissions_override && Object.keys(user.permissions_override).length > 0;
                            return (
                            <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-bold text-gray-900 dark:text-white">{user.username}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{user.fullName}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.email}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.operatingUnit}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    {hasOverrides ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                                            ACTIVE OVERRIDES
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-400 italic">None</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button onClick={() => handleEditPermissions(user)} className="inline-flex items-center text-amber-600 hover:text-amber-900 dark:text-amber-500 dark:hover:text-amber-400 mr-4" title="Manage Permissions">
                                        <Shield className="h-4 w-4 mr-1" /> Permissions
                                    </button>
                                    <button onClick={() => handleEditUser(user)} className="text-accent hover:text-green-900 dark:hover:text-emerald-400 mr-4">Edit</button>
                                    <button onClick={() => handleDeleteUser(user.id)} className="text-red-600 hover:text-red-900 dark:text-red-500 dark:hover:text-red-400">Delete</button>
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
            </div>

            {/* Permission Override Modal */}
            {isPermissionModalOpen && editingUser && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/80 rounded-t-xl">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <UserCog className="h-6 w-6 text-amber-600" />
                                    Surgical Access Control
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Managing specific overrides for <strong className="text-gray-900 dark:text-white">{editingUser.fullName}</strong> ({editingUser.role})
                                </p>
                            </div>
                            <button onClick={() => setIsPermissionModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                <XIcon className="h-6 w-6" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 bg-gray-50/30 dark:bg-gray-900/50">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800/50 flex items-start gap-3 mb-6">
                                <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-800 dark:text-blue-300">
                                    <p className="font-semibold mb-1">Priority Logic Active</p>
                                    <p>Toggles shown below are initialized with the defaults for role <strong>{editingUser.role}</strong>. Making a change here creates a specific <i>user override</i> that will bypass their role's permissions.</p>
                                </div>
                            </div>
                            
                            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm bg-white dark:bg-gray-800">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-800/80">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Module / Feature</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Override Active?</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-32 border-l border-gray-200 dark:border-gray-700">View</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-32">Edit</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-32">Delete</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {appModules.map(module => {
                                            const roleDefault = roleDefaults.find(r => r.module === module) || { can_view: false, can_edit: false, can_delete: false };
                                            const hasOverride = userOverrides[module] !== undefined;
                                            
                                            // Get effective config
                                            const effectiveConfig = hasOverride 
                                                ? userOverrides[module] 
                                                : roleDefault;
                                            
                                            const Toggle = ({ field, label }: { field: 'can_view'|'can_edit'|'can_delete', label: string }) => {
                                                const val = effectiveConfig[field];
                                                const color = field === 'can_view' ? 'emerald' : field === 'can_edit' ? 'amber' : 'red';
                                                
                                                return (
                                                    <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                        <div className={`w-12 h-6 rounded-full relative transition-colors ${val ? `bg-${color}-500` : 'bg-gray-300 dark:bg-gray-600'}`}>
                                                            <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${val ? 'translate-x-6' : 'translate-x-0'} shadow-sm`}></span>
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
                                                <tr key={module} className={`hover:bg-gray-50/50 dark:hover:bg-gray-750 transition-colors ${hasOverride ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}>
                                                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                                                        {module}
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        {hasOverride ? (
                                                            <div className="flex flex-col items-center">
                                                                <span className="inline-flex px-2 py-0.5 rounded textxs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 mb-1">
                                                                    Yes
                                                                </span>
                                                                <button onClick={() => handleClearOverride(module)} className="text-[10px] text-gray-500 hover:text-red-600 underline">Clear Override</button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs italic">No (Default)</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4 border-l border-gray-100 dark:border-gray-700/50">
                                                        <div className="flex justify-center"><Toggle field="can_view" label="View" /></div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex justify-center"><Toggle field="can_edit" label="Edit" /></div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex justify-center"><Toggle field="can_delete" label="Delete" /></div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-xl flex justify-end gap-3">
                            <button 
                                onClick={() => setIsPermissionModalOpen(false)}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePermissions}
                                disabled={saving}
                                className={`flex items-center gap-2 px-6 py-2 rounded-md text-white font-medium transition-all ${saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-md'}`}
                            >
                                <Save className="h-5 w-5" />
                                {saving ? 'Saving...' : 'Save Overrides'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* User Modal */}
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
                                    <option value="Super Admin">Super Admin</option>
                                    <option value="Administrator">Administrator</option>
                                    <option value="Focal - User">Focal - User</option>
                                    <option value="RFO - User">RFO - User</option>
                                    <option value="User">User</option>
                                    <option value="Guest">Guest</option>
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
                            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600">
                                    Cancel
                                </button>
                                <button type="submit" className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-opacity-90 shadow-sm">
                                    Save User
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