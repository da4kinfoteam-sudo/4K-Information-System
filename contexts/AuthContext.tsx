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
    const currentUserRef = useRef<User | null>(currentUser);
    const isInitializingRef = useRef(false);

    useEffect(() => {
        currentUserRef.current = currentUser;
    }, [currentUser]);

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
    }, []);

    useEffect(() => {
        if (!supabase) {
            setIsAuthReady(true);
            return;
        }

        const syncUserFromSession = async (session: any) => {
            if (!session?.user) return;
            try {
                const { data } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', session.user.email)
                    .maybeSingle();
                
                if (data) {
                    setCurrentUser(data as User);
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
            } catch (err) {
                console.error("Sync user error:", err);
            }
        };

const initializeAuth = async () => {
            if (isInitializingRef.current) return;
            isInitializingRef.current = true;
            console.log("Initializing Auth...");
            
            try {
                // 1. Check initial session with a 25s timeout to prevent hanging on slow network/cold starts
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise<{ data: { session: null } }>(resolve => 
                    setTimeout(() => resolve({ data: { session: null } }), 25000)
                );

                const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
                console.log("Initial session check resolved. Session exists:", !!session);
                
                if (session?.user) {
                    await syncUserFromSession(session);
                } else {
                    const current = currentUserRef.current;
                    if (current && !current.email?.endsWith('@offline.local')) {
                        console.log("No valid Supabase session found. Clearing local stale session.");
                        setCurrentUser(null);
                    }
                }
            } catch (err) {
                console.error("Auth initialization failed or timed out:", err);
            } finally {
                setIsAuthReady(true);
                // Keep isInitializingRef true to prevent re-init if component re-mounts unexpectedly
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Supabase Auth Event:", event, "Session exists:", !!session);
            
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session) await syncUserFromSession(session);
            } else if (event === 'SIGNED_OUT') {
                const current = currentUserRef.current;
                if (current && !current.email?.endsWith('@offline.local')) {
                    setCurrentUser(null);
                }
            }
        });

        initializeAuth();

        return () => subscription.unsubscribe();
    }, []);

    const login = (user: User) => {
        setCurrentUser(user);
    };

    const logout = async () => {
        console.log("Logout initiated...");
        if (supabase) {
            try {
                // signOut from Supabase. We don't await indefinitely to prevent hanging UI.
                const { error } = await Promise.race([
                    supabase.auth.signOut(),
                    new Promise<{ error: any }>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
                ]) as any;
                if (error) console.warn("Supabase forced sign out error:", error);
            } catch (err) {
                console.error("Sign out exception (continuing clearing local state):", err);
            }
        }
        
        // Ensure ALL auth-related local storage is gone
        localStorage.removeItem('currentUserSession');
        // Clear potential Supabase tokens too if we want to be aggressive
        Object.keys(localStorage).forEach(key => {
            if (key.includes('sb-') && key.includes('-auth-token')) {
                localStorage.removeItem(key);
            }
        });
        
        setCurrentUser(null);
        console.log("Local auth state cleared. Redirecting...");
        
        // Optional: Force a window reload to clean up all states if the user is really stuck
        // window.location.href = '/'; 
    };

    const hasAccess = (module: string, action: 'view' | 'edit' | 'delete'): boolean => {
        if (!currentUser) return false;

        // Super Admins and Administrators have full access bypass
        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return true;

        if (currentUser.permissions_override && typeof currentUser.permissions_override === 'object') {
            const moduleOverride = currentUser.permissions_override[module];
            if (moduleOverride && typeof moduleOverride[`can_${action}`] === 'boolean') {
                return moduleOverride[`can_${action}`];
            }
        }

        // Role-Level Granular Permissions
        if (rolesConfigs && rolesConfigs.length > 0) {
            const roleDef = rolesConfigs.find(c => c.role === currentUser.role && c.module === module);
            if (roleDef && typeof roleDef[`can_${action}`] === 'boolean') {
                return !!roleDef[`can_${action}`];
            }
        }

        // By default, everyone can view but not edit/delete
        if (action === 'view') return true; 
        return false;
    };

    const getVisibilityScope = (module: string): 'All' | 'Own OU' => {
        if (!currentUser) return 'Own OU';
        
        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return 'All';

        // Check if the individual user has a forcefully restricted visibility scope.
        if (currentUser.visibility_scope === 'Own OU') return 'Own OU';
        if (currentUser.visibility_scope === 'All OUs') return 'All';

        const checkVisibility = (modName: string) => {
            if (rolesConfigs && rolesConfigs.length > 0) {
                const roleDef = rolesConfigs.find(c => c.role === currentUser.role && c.module === modName);
                if (roleDef && roleDef.visibility_scope) {
                    return (roleDef.visibility_scope === 'Own OU' || roleDef.visibility_scope === 'Own OUs') ? 'Own OU' : 'All';
                }
            }
            return null;
        };

        const granularVisibility = checkVisibility(module);
        if (granularVisibility !== null) return granularVisibility;

        if (['Super Admin', 'Administrator', 'Management'].includes(currentUser.role)) {
            return 'All';
        }
        
        return 'Own OU';
    };

    const fetchCurrentUser = async () => {
        if (!supabase || !currentUser?.id) return;
        const { data, error } = await supabase.from('users').select('*').eq('id', currentUser.id).single();
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
