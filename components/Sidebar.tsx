
import React from 'react';
import { navigationLinks, NavLink, SettingsIcon } from '../constants';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
    isOpen: boolean;
    closeSidebar: () => void;
    currentPage: string;
    setCurrentPage: (page: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, closeSidebar, currentPage, setCurrentPage }) => {
    const { currentUser } = useAuth();
    
    const NavItem: React.FC<{ link: NavLink }> = ({ link }) => {
        const isActive = currentPage === link.href;
        return (
            <a 
                href={link.href}
                onClick={(e) => {
                    e.preventDefault();
                    setCurrentPage(link.href);
                    // Only close on mobile (when window width is small)
                    if (window.innerWidth < 768) {
                        closeSidebar();
                    }
                }}
                className={`flex items-center p-3 my-1 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 whitespace-nowrap overflow-hidden ${isActive ? 'bg-gray-200 dark:bg-gray-700 font-semibold' : 'font-medium'}`}
            >
                <span>{link.name}</span>
            </a>
        );
    }

    return (
        <>
            {/* Overlay for mobile */}
            <div 
                className={`fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={closeSidebar}
            ></div>

            {/* Sidebar */}
            <aside 
                className={`fixed top-0 left-0 h-full bg-white dark:bg-gray-800 shadow-xl z-30 transform transition-all duration-300 ease-in-out md:relative md:shadow-none flex flex-col ${isOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:w-0 md:translate-x-0 md:overflow-hidden'}`}
            >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col items-center text-center flex-shrink-0 whitespace-nowrap overflow-hidden">
                    <div className="flex items-center justify-between w-full">
                         <div className="w-6 md:hidden"></div> {/* Mobile Spacer left */}
                         <div className="hidden md:block w-full"> {/* Desktop wrapper */}
                             <a href="/" onClick={(e) => { e.preventDefault(); setCurrentPage('/'); }} className="flex flex-col items-center group">
                                <div className="p-3 bg-white dark:bg-gray-700 rounded-full shadow-sm mb-3 group-hover:shadow-md transition-shadow">
                                    <img 
                                        src="/assets/4klogo.png" 
                                        alt="DA 4K Logo" 
                                        className="h-[5.2rem] w-[5.2rem] object-contain"
                                    />
                                </div>
                                <h1 className="text-lg font-bold text-gray-800 dark:text-white leading-tight">4K Information System</h1>
                            </a>
                         </div>
                         
                         {/* Mobile View */}
                         <a href="/" onClick={(e) => { e.preventDefault(); setCurrentPage('/'); }} className="flex flex-col items-center md:hidden w-full">
                            <img 
                                src="/assets/4klogo.png" 
                                alt="DA 4K Logo" 
                                className="h-[3.25rem] w-[3.25rem] object-contain mb-1"
                            />
                            <h1 className="text-lg font-bold text-gray-800 dark:text-white">4K IS</h1>
                        </a>

                        <button onClick={closeSidebar} className="md:hidden text-gray-500 hover:text-gray-800 dark:hover:text-white self-start ml-auto absolute right-4 top-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <nav className="p-4 flex-1 overflow-y-auto overflow-x-hidden">
                    <ul>
                        {navigationLinks.map((link) => {
                             // Hide References for Management Role
                             if (link.href === '/references' && currentUser?.role === 'Management') return null;
                             
                             return (
                                <li key={link.name}>
                                    {link.type === 'separator' ? (
                                        <hr className="my-2 border-gray-200 dark:border-gray-700" />
                                    ) : (
                                        <NavItem link={link} />
                                    )}
                                </li>
                             );
                        })}
                    </ul>
                </nav>
                
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 whitespace-nowrap overflow-hidden">
                    <a 
                        href="/settings"
                        onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage('/settings');
                            if (window.innerWidth < 768) closeSidebar();
                        }}
                        className={`flex items-center p-3 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 ${currentPage === '/settings' ? 'bg-gray-200 dark:bg-gray-700 font-semibold' : 'font-medium'}`}
                    >
                        <span>User Settings</span>
                    </a>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;