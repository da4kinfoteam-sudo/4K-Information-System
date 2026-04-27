// Author: 4K 
import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { User } from '../constants';
import useLocalStorageState from '../hooks/useLocalStorageState';
import { useSupabaseTable } from '../hooks/useSupabaseTable';
import { supabase } from '../supabaseClient';

interface AuthContextType {
    currentUser: User | null;
    login: (user: User) => void;
    logout: () => void;
    usersList: User[];
    setUsersList: React.Dispatch<React.SetStateAction<User[]>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useLocalStorageState<User | null>('currentUserSession', null);
    
    // Centralized user list management synced with Supabase 'users' table
    // Initialized with empty array to rely on database fetching
    const [usersList, setUsersList] = useSupabaseTable<User>('users', []);

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
                    if (data && data.length > 0) setCurrentUser(data[0] as User);
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
        // Clear all local storage items to reset persistency of filters and states immediately
        localStorage.clear();
        setCurrentUser(null);
        
        if (supabase) {
            // Do not block UI if network is down
            supabase.auth.signOut().catch(console.error);
        }
    };

    return (
        <AuthContext.Provider value={{ currentUser, login, logout, usersList, setUsersList }}>
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