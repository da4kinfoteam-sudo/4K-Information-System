
import React, { useState, useEffect } from 'react';
import {
    BarChart3,
    BookOpen,
    Briefcase,
    CalendarDays,
    CheckCircle2,
    CircleDollarSign,
    ClipboardList,
    Database,
    FileText,
    Folder,
    Home,
    LayoutDashboard,
    MapPinned,
    Settings,
    Store,
    TrendingUp,
    UsersRound
} from 'lucide-react';
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
    const { currentUser, hasAccess } = useAuth();
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const navIconMap: Record<string, React.ReactNode> = {
        'Homepage': <Home />,
        'Reports': <BarChart3 />,
        'Dashboard': <LayoutDashboard />,
        'Data Collection Forms': <ClipboardList />,
        'Subprojects': <Folder />,
        'Activities': <CalendarDays />,
        'Program Management': <Briefcase />,
        'Accomplishment Forms': <CheckCircle2 />,
        'Financial': <CircleDollarSign />,
        'Physical': <TrendingUp />,
        'Indigenous Peoples Organization': <UsersRound />,
        'Resources': <Database />,
        'Marketing Database': <Store />,
        'Level of Development': <MapPinned />,
        'Commodity Mapping': <MapPinned />,
        'References': <BookOpen />,
        'User Settings': <Settings />
    };

    const getInitials = (name: string) => name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join('')
        .toUpperCase();

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

    const renderNavIcon = (item: NavItem) => (
        <span className="app-sidebar__nav-icon" aria-hidden="true">
            {navIconMap[item.name] || item.icon || <span className="app-sidebar__nav-initials">{getInitials(item.name)}</span>}
        </span>
    );

    const renderNavItem = (item: NavItem) => {
        // Legacy Permission Check
        if (item.hiddenFor && currentUser && item.hiddenFor.includes(currentUser.role)) {
            return null;
        }

        // Granular Management checks based on modules
        if (item.name === 'Homepage') return (
            <li key={item.name} className="mb-1">
                <a
                    href={item.href}
                    onClick={(e) => { e.preventDefault(); if(item.href) handleLinkClick(item.href); }}
                    className={`app-sidebar__nav-item ${item.href === currentPage ? 'app-sidebar__nav-item--active' : ''}`}
                    title={item.name}
                >
                    {renderNavIcon(item)}
                    <span className="app-sidebar__label">{item.name}</span>
                </a>
            </li>
        );

        const moduleMapping: Record<string, string> = {
            'Dashboards': 'Dashboards',
            'Reports': 'Reports',
            'Subprojects': 'Subprojects',
            'Activities': 'Activities',
            'Program Management': 'Program Management',
            'Financial': 'Accomplishment - Financial',
            'Physical': 'Accomplishment - Physical',
            'Indigenous Peoples Organization': 'IPO Management',
            'Marketing Database': 'Marketing Database',
            'Level of Development': 'Level of Development',
            'Commodity Mapping': 'Commodity Mapping',
            'References': 'References'
        };

        const checkAccessRecursive = (navItem: NavItem): boolean => {
            if (navItem.children) {
                return navItem.children.some(child => checkAccessRecursive(child));
            }
            const moduleName = moduleMapping[navItem.name] || navItem.name;
            return hasAccess(moduleName, 'view');
        };

        if (!checkAccessRecursive(item)) return null;

        const isGroup = !!item.children;
        const isExpanded = expandedGroups.has(item.name);
        const isActive = item.href === currentPage || (isGroup && item.children?.some(c => c.href === currentPage));

        if (isGroup) {
            return (
                <li key={item.name} className="mb-1">
                    <button
                        onClick={() => toggleGroup(item.name)}
                        className={`app-sidebar__nav-item ${isActive ? 'app-sidebar__nav-item--active' : ''}`}
                        title={item.name}
                    >
                        {renderNavIcon(item)}
                        <span className="app-sidebar__label">{item.name}</span>
                        <span className="app-sidebar__chevron">{isExpanded ? <ChevronDown /> : <ChevronRight />}</span>
                    </button>
                    {isExpanded && (
                        <ul className="app-sidebar__subnav space-y-1">
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
                    className={`app-sidebar__nav-item ${item.href === currentPage ? 'app-sidebar__nav-item--active' : ''}`}
                    title={item.name}
                >
                    {renderNavIcon(item)}
                    <span className="app-sidebar__label">{item.name}</span>
                </a>
            </li>
        );
    };

    return (
        <>
            {/* Overlay for mobile */}
            <div
                className={`app-sidebar-overlay md:hidden ${isOpen ? '' : 'app-sidebar-overlay--hidden'}`}
                onClick={closeSidebar}
            ></div>

            {/* Sidebar Wrapper */}
            <div className={`app-sidebar-shell ${isOpen ? 'app-sidebar-shell--open' : ''}`}>
                {/* Main Aside */}
                <aside
                    className={`app-sidebar ${isOpen ? 'app-sidebar--open' : ''}`}
                >
                    {/* Header / Logo */}
                    <div className="relative flex-shrink-0">
                        <a href="/" onClick={(e) => { e.preventDefault(); setCurrentPage('/'); }} className="app-sidebar__brand group">
                            <div className="app-sidebar__logo group-hover:shadow-md transition-shadow">
                                <img 
                                    src="/assets/4klogo.png" 
                                    alt="DA 4K Logo" 
                                />
                            </div>
                            <div className="app-sidebar__title">
                                <strong>4K Information System</strong>
                            </div>
                        </a>
                        
                        {/* Mobile Close Button */}
                        <button onClick={closeSidebar} className="app-sidebar__mobile-close md:hidden" aria-label="Close sidebar">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="app-sidebar__nav custom-scrollbar">
                        <ul className="app-sidebar__nav-list">
                            {navigationStructure.map(item => renderNavItem(item))}
                        </ul>
                    </nav>
                    
                    {/* Footer / Settings */}
                    <div className="app-sidebar__footer">
                        <a 
                            href="/settings"
                            onClick={(e) => {
                                e.preventDefault();
                                handleLinkClick('/settings');
                            }}
                            className={`app-sidebar__nav-item ${currentPage === '/settings' ? 'app-sidebar__nav-item--active' : ''}`}
                            title="User Settings"
                        >
                            <span className="app-sidebar__nav-icon" aria-hidden="true">{navIconMap['User Settings']}</span>
                            <span className="app-sidebar__label">User Settings</span>
                        </a>
                    </div>
                </aside>
            </div>
        </>
    );
};

export default Sidebar;
