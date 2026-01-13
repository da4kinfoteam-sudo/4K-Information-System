
// Author: 4K
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

const Login: React.FC = () => {
    const { login, usersList } = useAuth();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [dbStatus, setDbStatus] = useState<'online' | 'offline'>('offline');

    // Check Supabase connection on mount for UI indicator
    useEffect(() => {
        const checkConnection = async () => {
            if (!supabase) return;
            try {
                const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
                if (!error) setDbStatus('online');
            } catch (e) {
                console.warn("Supabase connection check failed:", e);
                setDbStatus('offline');
            }
        };
        checkConnection();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            let user = null;
            let isPasswordInvalid = false;

            // 1. Attempt Direct Database Authentication
            // We attempt this regardless of the initial dbStatus check to ensure we try even if connection was flaky at mount.
            if (supabase) {
                try {
                    // Try finding by username first
                    let { data, error } = await supabase
                        .from('users')
                        .select('*')
                        .eq('username', identifier)
                        .maybeSingle();

                    if (error) console.warn('Supabase Login Query Error (Username):', error);

                    // If not found, try finding by email
                    if (!data) {
                        const result = await supabase
                            .from('users')
                            .select('*')
                            .eq('email', identifier)
                            .maybeSingle();
                        data = result.data;
                        if (result.error) console.warn('Supabase Login Query Error (Email):', result.error);
                    }

                    if (data) {
                        // User found in DB
                        // Verify password (plaintext comparison as per current schema)
                        if (data.password === password) {
                            user = data;
                        } else {
                            isPasswordInvalid = true;
                        }
                    }
                } catch (dbErr) {
                    console.warn("Database auth exception (Offline?):", dbErr);
                    // Do not block fallback if DB fails
                }
            }

            // If DB explicitly said wrong password, stop.
            if (isPasswordInvalid) {
                setError('Invalid password.');
                setIsLoading(false);
                return;
            }

            // 2. Fallback: Check Local Context List
            // This handles cases where DB might be offline but data was loaded previously (though rare with empty init)
            if (!user) {
                 user = usersList.find(u => 
                    (u.email === identifier || u.username === identifier) && 
                    (u.password === password)
                );
            }

            // 3. Fallback: Hardcoded Admin (Offline/Emergency Mode)
            // Allows login even if DB is empty or unreachable
            if (!user) {
                if (identifier === 'admin' && password === 'admin') {
                    user = {
                        id: 99999, // Temporary ID
                        username: 'admin',
                        fullName: 'System Administrator',
                        email: 'admin@offline.local',
                        role: 'Administrator',
                        operatingUnit: 'NPMO',
                        password: 'admin'
                    };
                }
            }

            if (user) {
                login(user);
            } else {
                setError('Invalid email/username or password.');
            }
        } catch (err) {
            console.error("Login exception:", err);
            setError('An unexpected error occurred during login.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4 transition-colors duration-200">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full animate-fadeIn">
                <div className="flex flex-col items-center mb-8">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-full mb-4 shadow-sm">
                        <img 
                            src="/assets/4klogo.png" 
                            alt="DA 4K Logo" 
                            className="h-24 w-24 object-contain"
                        />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white text-center">4K Information System</h1>
                    <div className="flex items-center gap-2 mt-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${dbStatus === 'online' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            {dbStatus === 'online' ? 'Database Connected' : 'Offline Mode'}
                        </p>
                    </div>
                </div>
                
                {error && (
                    <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded relative mb-6 text-sm" role="alert">
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address or Username</label>
                        <input 
                            type="text" 
                            required 
                            value={identifier} 
                            onChange={(e) => setIdentifier(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm text-gray-900 dark:text-white"
                            placeholder="Enter your username or email"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                        <input 
                            type="password" 
                            required 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm text-gray-900 dark:text-white"
                            placeholder="Enter your password"
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-colors duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <div className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Authenticating...
                            </div>
                        ) : 'Sign In'}
                    </button>
                </form>
                <p className="mt-6 text-xs text-center text-gray-400 dark:text-gray-500">
                    Protected by DA-4K Program Management Office
                </p>
            </div>
        </div>
    );
};

export default Login;
