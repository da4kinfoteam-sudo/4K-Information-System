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
    const [connError, setConnError] = useState<string | null>(null);

    const checkConnection = async () => {
        if (!supabase) {
            setDbStatus('offline');
            setConnError("Database client not initialized.");
            return;
        }
        
        try {
            const { error: dbError } = await supabase.from('users').select('id', { head: true, count: 'exact' }).limit(1);
            if (!dbError) {
                setDbStatus('online');
                setConnError(null);
            } else {
                setDbStatus('offline');
                setConnError(dbError.message);
            }
        } catch (e: any) {
            setDbStatus('offline');
            setConnError(e.message);
        }
    };

    useEffect(() => {
        checkConnection();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            let user = null;

            if (supabase) {
                // Direct database lookup
                let { data, error: dbError } = await supabase
                    .from('users')
                    .select('*')
                    .or(`username.eq."${identifier}",email.eq."${identifier}"`)
                    .eq('password', password)
                    .maybeSingle();

                if (dbError) {
                    console.error("Direct Auth Error:", dbError);
                } else if (data) {
                    user = data;
                }
            }

            // Fallback for hardcoded admin
            if (!user && identifier === 'admin' && password === 'admin') {
                user = {
                    id: 99999,
                    username: 'admin',
                    fullName: 'System Administrator',
                    email: 'admin@system.local',
                    role: 'Super Admin' as any,
                    operatingUnit: 'NPMO',
                    password: 'admin'
                };
            }

            if (user) {
                login(user);
            } else {
                setError('Invalid credentials. Access denied.');
            }
        } catch (err) {
            console.error("Login exception:", err);
            setError('System error during validation.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4 transition-colors duration-200">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full animate-fadeIn border border-gray-200 dark:border-gray-700">
                <div className="flex flex-col items-center mb-8">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-full mb-4 shadow-sm border border-gray-100 dark:border-gray-600">
                        <img 
                            src="/assets/4klogo.png" 
                            alt="DA 4K Logo" 
                            className="h-20 w-20 object-contain"
                        />
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white text-center tracking-tight">4K Information System</h1>
                    <div className="flex flex-col items-center gap-1 mt-3">
                        <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${dbStatus === 'online' ? 'bg-emerald-500' : 'bg-red-400'}`}></span>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                {dbStatus === 'online' ? 'Connected' : 'Offline'}
                            </p>
                        </div>
                        {connError && (
                            <p className="text-[9px] text-red-500 text-center font-bold uppercase tracking-tighter">
                                {connError}
                            </p>
                        )}
                    </div>
                </div>
                
                {error && (
                    <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl mb-6 text-xs font-bold text-center" role="alert">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Identity Handle</label>
                        <input 
                            type="text" 
                            required 
                            value={identifier} 
                            onChange={(e) => setIdentifier(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white"
                            placeholder="Username or Email"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Access Key</label>
                        <input 
                            type="password" 
                            required 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white"
                            placeholder="Password"
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                    >
                        {isLoading ? 'Verifying...' : 'Initialize Session'}
                    </button>
                </form>
                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-[9px] text-center font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                        Protected System Architecture • PMO 4K
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;