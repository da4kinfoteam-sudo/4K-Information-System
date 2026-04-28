import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { RoleConfig, appModules, UserRole } from '../../constants';
import { Save, AlertTriangle, Info, Check, X } from 'lucide-react';

const allRoles: UserRole[] = ['Super Admin', 'Administrator', 'Management', 'Focal - User', 'RFO - User', 'User', 'Guest'];

const UserControlCenterTab: React.FC = () => {
    const [configs, setConfigs] = useState<RoleConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    // Initial state matching
    const [pendingConfigs, setPendingConfigs] = useState<RoleConfig[]>([]);

    const [success, setSuccess] = useState<boolean>(false);

    const { refreshPermissions } = useAuth();

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        if (!supabase) return;
        setLoading(true);
        const { data, error } = await supabase.from('roles_config').select('*');
        if (error) {
            setError(error.message);
        } else if (data) {
            // Seed any missing configurations
            const fullSet: RoleConfig[] = [];
            allRoles.forEach(role => {
                appModules.forEach(module => {
                    const existing = data.find(c => c.role === role && c.module === module);
                    if (existing) {
                        fullSet.push(existing);
                    } else {
                        // Defaults based on role
                        fullSet.push({
                            role: role as string,
                            module,
                            can_view: true,
                            can_edit: ['Super Admin', 'Administrator'].includes(role),
                            can_delete: ['Super Admin', 'Administrator'].includes(role)
                        });
                    }
                });
            });
            setConfigs(fullSet);
            setPendingConfigs(fullSet);
        }
        setLoading(false);
    };

    const handleToggle = (role: string, module: string, field: 'can_view' | 'can_edit' | 'can_delete') => {
        setSuccess(false);
        setPendingConfigs(prev => prev.map(c => {
            if (c.role === role && c.module === module) {
                const newConfig = { ...c, [field]: !c[field] };
                // Logic: cannot edit or delete if cannot view
                if (field === 'can_view' && !newConfig.can_view) {
                    newConfig.can_edit = false;
                    newConfig.can_delete = false;
                }
                // Logic: Cannot view = false if trying to edit/delete
                if ((field === 'can_edit' || field === 'can_delete') && newConfig[field]) {
                    newConfig.can_view = true;
                }
                return newConfig;
            }
            return c;
        }));
    };

    const runWhiteScreenCheck = (): string | null => {
        // Mock-Mode Validation block
        for (const role of allRoles) {
            const roleConfigs = pendingConfigs.filter(c => c.role === role);
            if (roleConfigs.length > 0) {
                const hasAnyView = roleConfigs.some(c => c.can_view);
                if (!hasAnyView) {
                    return `Role "${role}" has absolutely zero access to the application. This will result in a white-screen or immediate lockout upon login. Please grant at least one view permission.`;
                }
            }
        }
        
        // Safety Profile for Super Admin User Control Center Edit logic
        // We ensure Super Admins at least have full rights to everything.
        const superAdminDeficits = pendingConfigs.filter(c => c.role === 'Super Admin' && (!c.can_view || !c.can_edit || !c.can_delete));
        if (superAdminDeficits.length > 0) {
            return `Warning: You are attempting to remove permissions from the 'Super Admin' role. Super Admins must always have full access to prevent system lockout.`;
        }

        return null; // Passes all checks
    };

    const handleSave = async () => {
        if (!supabase) return;

        const validationWarning = runWhiteScreenCheck();
        if (validationWarning) {
            setWarning(validationWarning);
            return;
        }

        setWarning(null);
        setSaving(true);
        setError(null);
        setSuccess(false);

        // Filter and Clean data for upsert
        const recordsToSave = pendingConfigs.map(c => {
            const cleaned: any = {
                role: c.role,
                module: c.module,
                can_view: !!c.can_view,
                can_edit: !!c.can_edit,
                can_delete: !!c.can_delete
            };
            
            // Critical: Only include ID if it is a truthy number to avoid "null value violates not-null" error
            if (c.id && c.id > 0) {
                cleaned.id = c.id;
            }
            return cleaned;
        });

        const { error } = await supabase.from('roles_config').upsert(
            recordsToSave,
            { onConflict: 'role,module' }
        );

        if (error) {
            setError(error.message);
        } else {
            setConfigs(JSON.parse(JSON.stringify(pendingConfigs)));
            setSuccess(true);
            await refreshPermissions();
            setTimeout(() => setSuccess(false), 5000);
        }
        setSaving(false);
    };

    const hasChanges = JSON.stringify(configs) !== JSON.stringify(pendingConfigs);

    if (loading) return <div className="p-4">Loading control center...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">Role-Level UX Control</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage global view, edit, and delete permissions for each role.</p>
                </div>
                <div className="flex items-center gap-4">
                    {success && (
                        <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm animate-pulse">
                            <Check className="h-5 w-5" />
                            Changes saved successfully!
                        </div>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-medium transition-all ${saving || !hasChanges ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg'}`}
                    >
                        <Save className="h-5 w-5" />
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3 border border-red-200">
                    <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-bold">Database Error</p>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            )}
            
            {warning && (
                <div className="p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-bold">Virtual Check Failed</p>
                        <p className="text-sm mt-1">{warning}</p>
                    </div>
                </div>
            )}

            <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-900">
                <div className="overflow-auto max-h-[650px] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
                    <table className="w-full text-sm text-left border-collapse table-fixed">
                        <thead className="text-gray-700 dark:text-gray-300">
                            <tr className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-40">
                                <th className="px-6 py-4 font-bold border-b border-r dark:border-gray-700 border-gray-200 bg-gray-100 dark:bg-gray-800 sticky left-0 top-0 z-50 w-48 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                                    User Roles
                                </th>
                                {appModules.map(module => (
                                    <th key={module} className="px-4 py-4 font-bold border-b border-r dark:border-gray-700 border-gray-200 text-center min-w-[200px] text-[11px] uppercase tracking-wider bg-gray-100 dark:bg-gray-800">
                                        {module}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {allRoles.map(role => (
                                <tr key={role} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-white border-r dark:border-gray-700 border-gray-200 bg-white dark:bg-gray-900 sticky left-0 z-30 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
                                        {role}
                                    </td>
                                    {appModules.map(module => {
                                        const config = pendingConfigs.find(c => c.role === role && c.module === module);
                                        if (!config) return <td key={module} className="p-4 border-r dark:border-gray-700 border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"></td>;
                                        
                                        const isSuperAdmin = role === 'Super Admin';
                                    return (
                                        <td key={module} className="px-4 py-3 align-top border-r border-gray-100 dark:border-gray-800/50">
                                            <div className="flex flex-col gap-2">
                                                <label className={`flex justify-between items-center text-[10px] p-1.5 rounded ${isSuperAdmin ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer'}`}>
                                                    <span className="text-gray-600 dark:text-gray-400 font-bold tracking-tight">VIEW</span>
                                                    <div className={`w-8 h-4 rounded-full relative transition-colors ${config.can_view ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                                        <span className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${config.can_view ? 'translate-x-4' : 'translate-x-0'}`}></span>
                                                    </div>
                                                    <input 
                                                        type="checkbox" 
                                                        className="hidden"
                                                        checked={config.can_view}
                                                        onChange={() => !isSuperAdmin && handleToggle(role, module, 'can_view')}
                                                        disabled={isSuperAdmin}
                                                    />
                                                </label>
                                                
                                                <label className={`flex justify-between items-center text-[10px] p-1.5 rounded ${isSuperAdmin ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer'}`}>
                                                    <span className="text-gray-600 dark:text-gray-400 font-bold tracking-tight">EDIT</span>
                                                    <div className={`w-8 h-4 rounded-full relative transition-colors ${config.can_edit ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                                        <span className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${config.can_edit ? 'translate-x-4' : 'translate-x-0'}`}></span>
                                                    </div>
                                                    <input 
                                                        type="checkbox" 
                                                        className="hidden"
                                                        checked={config.can_edit}
                                                        onChange={() => !isSuperAdmin && handleToggle(role, module, 'can_edit')}
                                                        disabled={isSuperAdmin}
                                                    />
                                                </label>

                                                <label className={`flex justify-between items-center text-[10px] p-1.5 rounded ${isSuperAdmin ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer'}`}>
                                                    <span className="text-gray-600 dark:text-gray-400 font-bold tracking-tight">DELETE</span>
                                                    <div className={`w-8 h-4 rounded-full relative transition-colors ${config.can_delete ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                                        <span className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${config.can_delete ? 'translate-x-4' : 'translate-x-0'}`}></span>
                                                    </div>
                                                    <input 
                                                        type="checkbox" 
                                                        className="hidden"
                                                        checked={config.can_delete}
                                                        onChange={() => !isSuperAdmin && handleToggle(role, module, 'can_delete')}
                                                        disabled={isSuperAdmin}
                                                    />
                                                </label>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            </div>
            
            <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50 flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-300">
                    <p className="font-semibold mb-1">How Role Control Works</p>
                    <p>Changing these toggles affects all users with that specific role. <strong>Super Admin</strong> always retains full systemic control and cannot be locked out. If you assign an override on a specific user in User Management, that override will supersede these defaults.</p>
                </div>
            </div>
        </div>
    );
};

export default UserControlCenterTab;
