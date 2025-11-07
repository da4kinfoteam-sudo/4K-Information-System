
import React from 'react';

interface HeaderProps {
    toggleSidebar: () => void;
    toggleDarkMode: () => void;
    isDarkMode: boolean;
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


const Header: React.FC<HeaderProps> = ({ toggleSidebar, toggleDarkMode, isDarkMode }) => {
    return (
        <header className="flex-shrink-0 bg-white dark:bg-gray-800 shadow-md">
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
                
                {/* Spacer to push dark mode toggle to the right */}
                <div className="flex-1"></div>

                {/* Dark Mode Toggle */}
                <button 
                    onClick={toggleDarkMode}
                    className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 focus:ring-accent"
                    aria-label="Toggle dark mode"
                >
                    {isDarkMode ? <SunIcon /> : <MoonIcon />}
                </button>
            </div>
        </header>
    );
};

export default Header;