
import React, { useState, useEffect } from 'react';
import { navigationStructure, NavItem } from '../constants';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
    isOpen: boolean;
    toggleSidebar: () => void;
    closeSidebar: () => void;
    currentPage: string;
    setCurrentPage: (page: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar, closeSidebar, currentPage, setCurrentPage }) => {
    const { currentUser } = useAuth();
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // Auto-expand groups based on current page
    useEffect(() => {
        const newExpanded = new Set(expandedGroups);
        let changed = false;
        navigationStructure.forEach(item => {
            if (item.children) {
                if (item.children.some(child => child.href === currentPage)) {
                    if (!newExpanded.has(item.name)) {
                        newExpanded.add(item.name);
                        changed = true;
                    }
                }
            }
        });
        if (changed) setExpandedGroups(newExpanded);
    }, [currentPage]);

    const toggleGroup = (name: string) => {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(name)) newSet.delete(name);
            else newSet.add(name);
            return newSet;
        });
    };

    const handleLinkClick = (href: string) => {
        setCurrentPage(href);
        if (window.innerWidth < 768) {
            closeSidebar();
        }
    };

    const ChevronDown = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
    );

    const ChevronRight = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
    );

    const renderNavItem = (item: NavItem) => {
        // Permission Check
        if (item.hiddenFor && currentUser && item.hiddenFor.includes(currentUser.role)) {
            return null;
        }

        const isGroup = !!item.children;
        const isExpanded = expandedGroups.has(item.name);
        const isActive = item.href === currentPage || (isGroup && item.children?.some(c => c.href === currentPage));

        // Updated Theme Colors to match white background
        // Active state remains Emerald as requested
        const activeClass = 'bg-emerald-600 text-white shadow-md font-semibold';
        // Inactive: Dark gray text, subtle gray hover
        const inactiveClass = 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700/50 hover:text-emerald-700 dark:hover:text-emerald-400 font-medium';
        // Group Active: Very light slate background
        const groupActiveClass = 'bg-slate-50 dark:bg-gray-700/50 text-emerald-800 dark:text-emerald-400 font-semibold';

        if (isGroup) {
            return (
                <li key={item.name} className="mb-1">
                    <button
                        onClick={() => toggleGroup(item.name)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 text-left ${isActive ? groupActiveClass : inactiveClass}`}
                    >
                        <div className="flex items-center gap-3">
                            <span>{item.name}</span>
                        </div>
                        {isExpanded ? <ChevronDown /> : <ChevronRight />}
                    </button>
                    {isExpanded && (
                        <ul className="mt-1 ml-4 border-l-2 border-gray-200 dark:border-gray-600 pl-2 space-y-1">
                            {item.children?.map(child => renderNavItem(child))}
                        </ul>
                    )}
                </li>
            );
        }

        return (
            <li key={item.name} className="mb-1">
                <a
                    href={item.href}
                    onClick={(e) => { e.preventDefault(); if(item.href) handleLinkClick(item.href); }}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${item.href === currentPage ? activeClass : inactiveClass}`}
                >
                    <span>{item.name}</span>
                </a>
            </li>
        );
    };

    return (
        <>
            {/* Overlay for mobile */}
            <div 
                className={`fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={closeSidebar}
            ></div>

            {/* Sidebar Wrapper */}
            <div className={`relative z-30 transition-all duration-300 ease-in-out ${isOpen ? 'w-64' : 'w-0'}`}>
                {/* Main Aside */}
                <aside 
                    className={`fixed top-0 left-0 h-full bg-white dark:bg-gray-800 shadow-xl md:shadow-none flex flex-col transition-transform duration-300 ease-in-out w-64 ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:absolute border-r border-gray-200 dark:border-gray-700`}
                    style={{ left: 0 }} 
                >
                    {/* Header / Logo */}
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex flex-col items-center text-center flex-shrink-0">
                        <a href="/" onClick={(e) => { e.preventDefault(); setCurrentPage('/'); }} className="flex flex-col items-center group w-full">
                            <div className="p-3 bg-white dark:bg-gray-700 rounded-full shadow-sm mb-3 group-hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-600">
                                <img 
                                    src="/assets/4klogo.png" 
                                    alt="DA 4K Logo" 
                                    className="h-24 w-24 object-contain"
                                />
                            </div>
                            <h1 className="text-xl font-bold text-slate-800 dark:text-white leading-tight">4K Information System</h1>
                        </a>
                        
                        {/* Mobile Close Button */}
                        <button onClick={closeSidebar} className="md:hidden absolute top-4 right-4 text-slate-500 hover:text-slate-800 dark:hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="p-4 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                        <ul>
                            {navigationStructure.map(item => renderNavItem(item))}
                        </ul>
                    </nav>
                    
                    {/* Footer / Settings */}
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                        <a 
                            href="/settings"
                            onClick={(e) => {
                                e.preventDefault();
                                handleLinkClick('/settings');
                            }}
                            className={`flex items-center gap-3 p-3 rounded-lg transition-colors duration-200 ${currentPage === '/settings' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700/50 hover:text-emerald-700 dark:hover:text-emerald-400 font-medium'}`}
                        >
                            <span>User Settings</span>
                        </a>
                    </div>
                </aside>

                {/* Desktop Toggle Notch */}
                <div 
                    onClick={toggleSidebar}
                    className={`hidden md:flex absolute top-1/2 -translate-y-1/2 w-5 h-16 bg-white dark:bg-gray-800 rounded-r-xl cursor-pointer items-center justify-center shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-y border-gray-200 dark:border-gray-700 z-40 transition-all duration-300 ease-in-out hover:bg-gray-50 dark:hover:bg-gray-700`}
                    style={{ right: '-20px' }} 
                    title={isOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                >
                    <div className="w-1 h-8 bg-gray-300 dark:bg-gray-500 rounded-full"></div>
                </div>
            </div>
        </>
    );
};

export default Sidebar;
