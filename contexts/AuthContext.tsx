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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useLocalStorageState<User | null>('currentUserSession', null);
    
    const [usersList, setUsersList] = useSupabaseTable<User>('users', []);
    
    const [rolesConfigs, setRolesConfigs] = useState<RoleConfig[]>([]);
    const currentUserRef = useRef<User | null>(currentUser);

    useEffect(() => {
        currentUserRef.current = currentUser;
    }, [currentUser]);

    useEffect(() => {
        if (!supabase) return;
        supabase.from('roles_config').select('*').then(({ data, error }) => {
            if (data) setRolesConfigs(data);
            if (error) console.error("Error fetching roles configs:", error);
        });
    }, []);

    useEffect(() => {
        if (!supabase) return;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Supabase Auth Event:", event);
            
            if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
                const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', session.user.email)
                    .limit(1);
                
                if (data && data.length > 0) {
                    setCurrentUser(data[0] as User);
                } else {
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
            } else if (event === 'SIGNED_OUT') {
                const current = currentUserRef.current;
                if (current && current.email && !current.email.endsWith('@offline.local')) {
                    console.log("Supabase SIGNED_OUT: Clearing session");
                    setCurrentUser(null);
                    localStorage.removeItem('currentUserSession');
                }
            }
        });

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user && !currentUserRef.current) {
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
        
        localStorage.removeItem('currentUserSession');
        setCurrentUser(null);
    };

    const hasAccess = (module: string, action: 'view' | 'edit' | 'delete'): boolean => {
        if (!currentUser) return false;

        if (currentUser.role === 'Super Admin' && module === 'System Management') {
            return true;
        }

        if (currentUser.permissions_override && typeof currentUser.permissions_override === 'object') {
            const moduleOverride = currentUser.permissions_override[module];
            if (moduleOverride && typeof moduleOverride[`can_${action}`] === 'boolean') {
                return moduleOverride[`can_${action}`];
            }
        }

        if (rolesConfigs && rolesConfigs.length > 0) {
            const roleDef = rolesConfigs.find(c => c.role === currentUser.role && c.module === module);
            if (roleDef) {
                return !!roleDef[`can_${action}`];
            }
        }

        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return true;
        if (action === 'view') return true; 
        return false;
    };

    const getVisibilityScope = (module: string): 'All' | 'Own OU' => {
        if (!currentUser) return 'Own OU';
        
        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return 'All';

        if (rolesConfigs && rolesConfigs.length > 0) {
            const roleDef = rolesConfigs.find(c => c.role === currentUser.role && c.module === module);
            if (roleDef && roleDef.visibility_scope) {
                return (roleDef.visibility_scope === 'Own OU' || roleDef.visibility_scope === 'Own OUs') ? 'Own OU' : 'All';
            }
        }

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
// --- End of AuthContext.tsx ---
