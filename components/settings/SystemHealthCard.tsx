
// Author: 4K
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const SystemHealthCard: React.FC = () => {
    const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
    const [latency, setLatency] = useState<number | null>(null);
    const [errorDetails, setErrorDetails] = useState<string>('');

    const testConnection = async () => {
        setConnectionStatus('checking');
        const start = performance.now();
        try {
            if (!supabase) throw new Error("Supabase client not initialized.");
            
            const { error } = await supabase.from('users').select('id').limit(1);
            
            if (error) throw error;
            
            const end = performance.now();
            setLatency(Math.round(end - start));
            setConnectionStatus('connected');
            setErrorDetails('');
        } catch (err: any) {
            console.error("Connection Test Failed:", err);
            setConnectionStatus('error');
            setErrorDetails(err.message || 'Unknown network error');
            setLatency(null);
        }
    };

    useEffect(() => {
        testConnection();
    }, []);

    return (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg mb-6 p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    System Health
                </h3>
                <button 
                    onClick={testConnection} 
                    disabled={connectionStatus === 'checking'}
                    className="text-sm text-accent hover:underline disabled:opacity-50"
                >
                    {connectionStatus === 'checking' ? 'Checking...' : 'Test Connection'}
                </button>
            </div>
            
            <div className={`p-4 rounded-md border ${
                connectionStatus === 'connected' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' :
                connectionStatus === 'error' ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' :
                'bg-gray-50 border-gray-200 dark:bg-gray-700/50 dark:border-gray-600'
            }`}>
                <div className="flex items-center">
                    <div className={`flex-shrink-0 h-3 w-3 rounded-full mr-3 ${
                        connectionStatus === 'connected' ? 'bg-green-500' :
                        connectionStatus === 'error' ? 'bg-red-500' :
                        'bg-gray-400 animate-pulse'
                    }`}></div>
                    <div className="flex-1">
                        <p className={`text-sm font-bold ${
                            connectionStatus === 'connected' ? 'text-green-800 dark:text-green-300' :
                            connectionStatus === 'error' ? 'text-red-800 dark:text-red-300' :
                            'text-gray-800 dark:text-gray-300'
                        }`}>
                            {connectionStatus === 'connected' ? 'Connected to Database' :
                                connectionStatus === 'error' ? 'Connection Failed' :
                                'Checking Status...'}
                        </p>
                        {latency && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Latency: {latency}ms
                            </p>
                        )}
                        {errorDetails && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
                                Error: {errorDetails}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemHealthCard;
