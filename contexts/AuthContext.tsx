import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../constants';
import useLocalStorageState from '../hooks/useLocalStorageState';

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
    
    // Centralized user list management for authentication
    const [usersList, setUsersList] = useLocalStorageState<User[]>('usersList', [
        { id: 1, username: "admin", fullName: "Admin User", email: "admin@da.gov.ph", role: "Administrator", operatingUnit: "NPMO", password: "admin" },
        { id: 2, username: "juan", fullName: "Juan Dela Cruz", email: "juan@da.gov.ph", role: "User", operatingUnit: "RPMO 4A", password: "user" },
    ]);

    const login = (user: User) => {
        setCurrentUser(user);
    };

    const logout = () => {
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
