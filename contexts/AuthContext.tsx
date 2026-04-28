// Author: 4K 
import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useLocalStorageState<User | null>('currentUserSession', null);
    
    // Centralized user list management synced with Supabase 'users' table
    // Initialized with empty array to rely on database fetching
    const [usersList, setUsersList] = useSupabaseTable<User>('users', []);
    
    const [rolesConfigs, setRolesConfigs] = useState<RoleConfig[]>([]);

    useEffect(() => {
        if (!supabase) return;
        supabase.from('roles_config').select('*').then(({ data, error }) => {
            if (data) setRolesConfigs(data);
            if (error) console.error("Error fetching roles configs:", error);
        });
    }, []);

    // Phase 3: Supabase Auth Session Listener
    useEffect(() => {
        if (!supabase) return;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                // Fetch full User profile from public.users table mapping by email
                // Use limit(1) instead of maybeSingle to avoid errors if there are duplicate emails
                const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', session.user.email)
                    .limit(1);
                
                if (error) {
                    console.error("Error fetching user profile after sign in:", error);
                }
                
                if (data && data.length > 0) {
                    setCurrentUser(data[0] as User);
                } else {
                    console.warn("User profile not found in public.users for email:", session.user.email);
                    // Temporary fallback: construct a basic user object so they are not stuck
                    // Ideally, fix_orphans.sql should be run to synchronize auth.users and public.users
                    const fallbackUser: User = {
                        id: Date.now(), 
                        username: session.user.email.split('@')[0],
                        email: session.user.email,
                        fullName: session.user.user_metadata?.full_name || 'Mapped User',
                        role: session.user.user_metadata?.role || 'User',
                        operatingUnit: session.user.user_metadata?.operatingUnit || 'NPMO',
                        password: ''
                    };
                    setCurrentUser(fallbackUser);
                }
            } else if (event === 'SIGNED_OUT') {
                setCurrentUser(null);
                localStorage.clear(); // Clear all persistency states
            }
        });

        // Initial session check
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user && !currentUser) {
                supabase.from('users').select('*').eq('email', session.user.email).limit(1).then(({ data, error }) => {
                    if (error) console.error("Initial session check error:", error);
                    if (data && data.length > 0) {
                        setCurrentUser(data[0] as User);
                    } else if (session.user) {
                        const fallbackUser: User = {
                            id: Date.now(), 
                            username: session.user.email?.split('@')[0] || 'user',
                            email: session.user.email || '',
                            fullName: session.user.user_metadata?.full_name || 'Mapped User',
                            role: session.user.user_metadata?.role || 'User',
                            operatingUnit: session.user.user_metadata?.operatingUnit || 'NPMO',
                            password: ''
                        };
                        setCurrentUser(fallbackUser);
                    }
                });
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const login = (user: User) => {
        // Fallback or transitional offline state update
        setCurrentUser(user);
    };

    const logout = async () => {
        if (supabase) {
            try {
                await supabase.auth.signOut();
            } catch (err) {
                console.error("Sign out error", err);
            }
        }
        
        // Clear local storage EXCEPT for supabase auth token if somehow it was needed, 
        // though signOut should have cleared it.
        localStorage.clear();
        setCurrentUser(null);
    };

    // Phase 5: Implementation of Priority Logic
    const hasAccess = (module: string, action: 'view' | 'edit' | 'delete'): boolean => {
        if (!currentUser) return false;

        // "White-Screen Prevention" Safety Profile for Super Admins
        // We ensure that super admins cannot be easily locked out of System Management
        if (currentUser.role === 'Super Admin' && module === 'System Management') {
            return true;
        }

        // Priority 1: User-Level Override (Surgical Control)
        if (currentUser.permissions_override && typeof currentUser.permissions_override === 'object') {
            const moduleOverride = currentUser.permissions_override[module];
            if (moduleOverride && typeof moduleOverride[`can_${action}`] === 'boolean') {
                return moduleOverride[`can_${action}`];
            }
        }

        // Priority 2: Role Defaults (Global Matrix)
        if (rolesConfigs && rolesConfigs.length > 0) {
            const roleDef = rolesConfigs.find(c => c.role === currentUser.role && c.module === module);
            if (roleDef) {
                return !!roleDef[`can_${action}`];
            }
        }

        // Priority 3: Fallback Behavior (Maintain legacy logic if unconfigured)
        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return true;
        if (action === 'view') return true; 
        // Note: For other modules, 'view' defaults to true, 'edit' defaults to false for common users.
        return false;
    };

    // Phase 6: Granular Visibility Scope enforcement
    const getVisibilityScope = (module: string): 'All' | 'Own OU' => {
        if (!currentUser) return 'Own OU'; // default restrictive
        
        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return 'All';

        if (rolesConfigs && rolesConfigs.length > 0) {
            const roleDef = rolesConfigs.find(c => c.role === currentUser.role && c.module === module);
            if (roleDef && roleDef.visibility_scope) {
                // Return whatever is configured in the roles config
                return (roleDef.visibility_scope === 'Own OU' || roleDef.visibility_scope === 'Own OUs') ? 'Own OU' : 'All';
            }
        }

        // Default behavior for other legacy roles
        if (['Super Admin', 'Administrator', 'Management'].includes(currentUser.role)) {
            return 'All';
        }
        
        return 'Own OU';
    };

    return (
        <AuthContext.Provider value={{ currentUser, login, logout, usersList, setUsersList, rolesConfigs, hasAccess, getVisibilityScope }}>
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