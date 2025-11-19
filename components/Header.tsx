
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SettingsIcon } from '../constants';

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
        <header className="flex-shrink-0 bg-white dark:bg-gray-800 shadow-md z-20">
            <div className="flex items-center justify-between p-4">
                {/* Mobile Menu Button */}
                <button 
                    onClick={toggleSidebar} 
                    className="md:hidden text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white focus:outline-none"
                    aria-label="Open sidebar"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                    </svg>
                </button>
                
                {/* Spacer to push content to the right */}
                <div className="flex-1"></div>

                <div className="flex items-center space-x-4">
                    {currentUser && (
                        <div className="relative" ref={menuRef}>
                             <div 
                                className="flex items-center gap-3 cursor-pointer"
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                            >
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">Hello, {currentUser.fullName}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{currentUser.role} | {currentUser.operatingUnit}</p>
                                </div>
                                <button 
                                    className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white focus:outline-none"
                                >
                                    <UserCircleIcon className="h-9 w-9" />
                                </button>
                            </div>

                            {isMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50 ring-1 ring-black ring-opacity-5 focus:outline-none animate-fadeIn">
                                    {/* Mobile only user info in dropdown */}
                                    <div className="sm:hidden px-4 py-2 border-b border-gray-100 dark:border-gray-700 mb-1">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{currentUser.fullName}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{currentUser.role}</p>
                                    </div>

                                    <button
                                        onClick={() => { setCurrentPage('/settings'); setIsMenuOpen(false); }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <SettingsIcon className="h-4 w-4 mr-2" />
                                        User Settings
                                    </button>
                                    <button
                                        onClick={toggleDarkMode}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        {isDarkMode ? <SunIcon className="h-4 w-4 mr-2" /> : <MoonIcon className="h-4 w-4 mr-2" />}
                                        {isDarkMode ? 'Set Light Mode' : 'Set Dark Mode'}
                                    </button>
                                    <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                                    <button
                                        onClick={() => { logout(); setIsMenuOpen(false); }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
