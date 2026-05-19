// Author: 4K
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SettingsIcon } from '../constants';
import { supabase } from '../supabaseClient';

interface HeaderProps {
    toggleSidebar: () => void;
    toggleDarkMode: () => void;
    isDarkMode: boolean;
    setCurrentPage: (page: string) => void;
}

const SunIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
);

const MoonIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
);

const UserCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const Header: React.FC<HeaderProps> = ({ toggleSidebar, toggleDarkMode, isDarkMode, setCurrentPage }) => {
    const { currentUser, logout } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [dbStatus, setDbStatus] = useState<'connected' | 'offline' | 'loading'>('loading');
    const failureCountRef = useRef(0);

    useEffect(() => {
        const timer = setInterval(() => setCurrentDate(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Check Database Connection
    useEffect(() => {
        const checkDb = async (isRetry = false) => {
            if (!supabase) {
                setDbStatus('offline');
                return;
            }
            try {
                // Heartbeat check: Efficiently check connection without heavy data transfer
                const fetchPromise = supabase.from('users').select('id', { head: true, count: 'exact' }).limit(1);
                const timeoutPromise = new Promise<{ error: any }>((_, reject) =>
                    setTimeout(() => reject(new Error("Network Threshold Exceeded")), 15000)
                );

                const { error } = await Promise.race([fetchPromise, timeoutPromise]) as any;

                if (!error) {
                    setDbStatus('connected');
                    failureCountRef.current = 0;
                } else {
                    throw error;
                }
            } catch (err: any) {
                failureCountRef.current += 1;
                console.warn(`Connection heartbeat failed (${failureCountRef.current}/3):`, err.message || err);

                if (failureCountRef.current >= 3) {
                    setDbStatus('offline');
                } else if (!isRetry) {
                    setTimeout(() => checkDb(true), 2500);
                }
            }
        };

        checkDb();

        const intervalId = setInterval(() => checkDb(false), 30000);
        return () => clearInterval(intervalId);
    }, []);

    const formattedDate = currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const dbStatusClass = dbStatus === 'connected'
        ? 'app-topbar__status--connected'
        : dbStatus === 'offline'
            ? 'app-topbar__status--offline'
            : 'app-topbar__status--loading';

    const dbStatusLabel = dbStatus === 'connected' ? 'System Online' : dbStatus === 'offline' ? 'Offline Mode' : 'Connecting...';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <header className="app-topbar">
            <div className="app-topbar__left">
                <button
                    onClick={toggleSidebar}
                    className="app-icon-button"
                    aria-label="Toggle sidebar"
                    title="Toggle sidebar"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                    </svg>
                </button>

                <div className="app-topbar__search" aria-label="Search placeholder">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
                    </svg>
                    <input type="search" placeholder="Search or type command..." aria-label="Search" />
                    <kbd>Ctrl K</kbd>
                </div>

                <span className="app-topbar__date">
                    {formattedDate}
                </span>
            </div>

            <div className="app-topbar__actions">
                <div className={`hidden md:flex app-topbar__status ${dbStatusClass}`} title={dbStatus === 'connected' ? 'Connected to Supabase' : 'Using Local Data / Offline'}>
                    <span className="app-topbar__status-dot"></span>
                    {dbStatusLabel}
                </div>

                <button
                    onClick={toggleDarkMode}
                    className="app-icon-button"
                    aria-label={isDarkMode ? 'Set light mode' : 'Set dark mode'}
                    title={isDarkMode ? 'Set Light Mode' : 'Set Dark Mode'}
                >
                    {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
                </button>

                {currentUser && (
                    <div className="app-topbar__user" ref={menuRef}>
                        <div
                            className="app-topbar__user-trigger"
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                        >
                            <div className="app-topbar__user-text hidden sm:block">
                                <p>Hello, {currentUser.fullName}</p>
                                <span>{currentUser.role} | {currentUser.operatingUnit}</span>
                            </div>
                            <button
                                className="app-topbar__avatar"
                                aria-label="Open user menu"
                            >
                                <UserCircleIcon className="h-8 w-8" />
                            </button>
                        </div>

                        {isMenuOpen && (
                            <div className="app-topbar__menu animate-fadeIn">
                                <div className="sm:hidden app-topbar__menu-info">
                                    <p>{currentUser.fullName}</p>
                                    <span>{currentUser.role}</span>
                                </div>

                                <div className="xl:hidden app-topbar__menu-status flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${
                                        dbStatus === 'connected' ? 'bg-green-500' :
                                        dbStatus === 'offline' ? 'bg-red-500' :
                                        'bg-gray-500'
                                    }`}></span>
                                    <span>{dbStatus === 'connected' ? 'Online' : 'Offline'}</span>
                                </div>

                                <button
                                    onClick={() => { setCurrentPage('/settings'); setIsMenuOpen(false); }}
                                    className="app-topbar__menu-item"
                                >
                                    <SettingsIcon className="h-4 w-4" />
                                    User Settings
                                </button>
                                <button
                                    onClick={toggleDarkMode}
                                    className="app-topbar__menu-item"
                                >
                                    {isDarkMode ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
                                    {isDarkMode ? 'Set Light Mode' : 'Set Dark Mode'}
                                </button>
                                <button
                                    onClick={() => { logout(); setIsMenuOpen(false); }}
                                    className="app-topbar__menu-item app-topbar__menu-item--danger"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;
