// Author: 4K 
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../constants';
import useLocalStorageState from '../hooks/useLocalStorageState';
import { useSupabaseTable } from '../hooks/useSupabaseTable';

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

    const login = (user: User) => {
        setCurrentUser(user);
    };

    const logout = () => {
        // Clear all local storage items to reset persistency of filters and states
        localStorage.clear();
        setCurrentUser(null);
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