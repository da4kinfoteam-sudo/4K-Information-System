// Author: 4K 
import React, { createContext, useContext, ReactNode, useEffect, useState, useRef } from 'react';
import { User, RoleConfig } from '../constants';
import useLocalStorageState from '../hooks/useLocalStorageState';
import { useSupabaseTable } from '../hooks/useSupabaseTable';
import { supabase } from '../supabaseClient';

interface AuthContextType {
    currentUser: User | null;
    login: (user: User) => void;
    logout: () => void;
    usersList: User[];
    setUsersList: React.Dispatch<React.SetStateAction<User[]>>;
    rolesConfigs: RoleConfig[];
    hasAccess: (module: string, action: 'view' | 'edit' | 'delete') => boolean;
    getVisibilityScope: (module: string) => 'All' | 'Own OU';
    refreshUser: () => Promise<void>;
    refreshPermissions: () => Promise<void>;
    isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useLocalStorageState<User | null>('currentUserSession', null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [usersList, setUsersList] = useSupabaseTable<User>('users', []);
    const [rolesConfigs, setRolesConfigs] = useState<RoleConfig[]>([]);

    const fetchRolesConfigs = async () => {
        if (!supabase) return;
        try {
            const { data, error } = await supabase.from('roles_config').select('*');
            if (data) setRolesConfigs(data);
            if (error) console.error("Error fetching roles configs:", error);
        } catch (err) {
            console.error("Fetch roles configs exception:", err);
        }
    };

    useEffect(() => {
        fetchRolesConfigs();
        setIsAuthReady(true);
    }, []);

    const login = (user: User) => {
        setCurrentUser(user);
    };

    const logout = () => {
        setCurrentUser(null);
        localStorage.removeItem('currentUserSession');
    };

    const hasAccess = (module: string, action: 'view' | 'edit' | 'delete'): boolean => {
        if (!currentUser) return false;
        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return true;

        if (currentUser.permissions_override && typeof currentUser.permissions_override === 'object') {
            const moduleOverride = currentUser.permissions_override[module];
            if (moduleOverride && typeof moduleOverride[`can_${action}`] === 'boolean') {
                return moduleOverride[`can_${action}`];
            }
        }

        if (rolesConfigs && rolesConfigs.length > 0) {
            const roleDef = rolesConfigs.find(c => c.role === currentUser.role && c.module === module);
            if (roleDef && typeof roleDef[`can_${action}`] === 'boolean') {
                return !!roleDef[`can_${action}`];
            }
        }

        if (action === 'view') return true; 
        return false;
    };

    const getVisibilityScope = (module: string): 'All' | 'Own OU' => {
        if (!currentUser) return 'Own OU';
        
        // 1. Admin Bypass
        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return 'All';

        // 2. Individual User Visibility Override (explicitly set in User Management)
        if (currentUser.visibility_scope === 'Own OU') return 'Own OU';
        if (currentUser.visibility_scope === 'All OUs') return 'All';

        // 3. Role-Level Configuration (from User Role Control Center)
        if (rolesConfigs && rolesConfigs.length > 0) {
            const roleDef = rolesConfigs.find(c => c.role === currentUser.role && c.module === module);
            if (roleDef && roleDef.visibility_scope) {
                return (roleDef.visibility_scope === 'All OUs') ? 'All' : 'Own OU';
            }
        }

        // 4. System Defaults (Legacy Fallbacks)
        if (['Management'].includes(currentUser.role)) {
            return 'All';
        }
        
        return 'Own OU';
    };

    const fetchCurrentUser = async () => {
        if (!supabase || !currentUser?.id) return;
        const { data } = await supabase.from('users').select('*').eq('id', currentUser.id).single();
        if (data) {
            setCurrentUser(data);
        }
    };

    return (
        <AuthContext.Provider value={{ 
            currentUser, login, logout, usersList, setUsersList, rolesConfigs, 
            hasAccess, getVisibilityScope, refreshUser: fetchCurrentUser, refreshPermissions: fetchRolesConfigs,
            isAuthReady
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
// --- End of AuthContext.tsx ---
