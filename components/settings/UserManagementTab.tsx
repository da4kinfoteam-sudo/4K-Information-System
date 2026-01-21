// Author: 4K
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User, operatingUnits } from '../../constants';
import { supabase } from '../../supabaseClient';

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

const UserManagementTab: React.FC = () => {
    const { usersList, setUsersList } = useAuth();
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

export default UserManagementTab;