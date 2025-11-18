import React from 'react';
import { navigationLinks, NavLink } from '../constants';

interface SidebarProps {
    isOpen: boolean;
    closeSidebar: () => void;
    currentPage: string;
    setCurrentPage: (page: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, closeSidebar, currentPage, setCurrentPage }) => {
    
    const NavItem: React.FC<{ link: NavLink }> = ({ link }) => {
        const isActive = currentPage === link.href;
        return (
            <a 
                href={link.href}
                onClick={(e) => {
                    e.preventDefault();
                    setCurrentPage(link.href);
                    closeSidebar();
                }}
                className={`flex items-center p-3 my-1 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 ${isActive ? 'bg-gray-200 dark:bg-gray-700 font-semibold' : 'font-medium'}`}
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
                className={`fixed top-0 left-0 w-64 h-full bg-white dark:bg-gray-800 shadow-xl z-30 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:shadow-none ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col items-center text-center">
                    <div className="flex items-center justify-between w-full">
                         <div className="w-10"></div> {/* Spacer */}
                         <a href="/" onClick={(e) => { e.preventDefault(); setCurrentPage('/'); }} className="flex flex-col items-center">
                            <img 
                                src="https://www.da.gov.ph/wp-content/uploads/2022/07/4K-LOGO-HIGH-RES-2-1536x1536.png" 
                                alt="DA 4K Logo" 
                                className="h-16 w-16 mb-2"
                            />
                            <h1 className="text-xl font-bold text-gray-800 dark:text-white">4K Information System</h1>
                        </a>
                        <button onClick={closeSidebar} className="md:hidden text-gray-500 hover:text-gray-800 dark:hover:text-white self-start">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <nav className="p-4">
                    <ul>
                        {navigationLinks.map((link) => (
                             <li key={link.name}>
                                {link.type === 'separator' ? (
                                    <hr className="my-2 border-gray-200 dark:border-gray-700" />
                                ) : (
                                    <NavItem link={link} />
                                )}
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>
        </>
    );
};

export default Sidebar;