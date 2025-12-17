
import React, { useState, useEffect, useMemo, useCallback } from 'react';

// API Base URL
const API_BASE = 'https://psgc.gitlab.io/api';

interface LocationItem {
    code: string;
    name: string;
}

interface LocationPickerProps {
    value: string;
    onChange: (value: string) => void;
    onRegionChange?: (region: string) => void;
    required?: boolean;
    allowOnline?: boolean;
}

// Utility to split location string
export const parseLocation = (location: string): { region: string; province: string; municipality: string; barangay: string; barangays: string[] } => {
    if (!location || location === "Online") {
        return { region: location === "Online" ? "Online" : "", province: "", municipality: "", barangay: "", barangays: [] };
    }
    const parts = location.split(',').map(p => p.trim());
    
    let province = '';
    let municipality = '';
    let barangays: string[] = [];

    if (parts.length === 2) {
        // Format: Municipality, Province
        municipality = parts[0];
        province = parts[1];
    } else if (parts.length >= 3) {
        // Format: Brgy 1, Brgy 2, Municipality, Province
        province = parts[parts.length - 1];
        municipality = parts[parts.length - 2];
        const barangayParts = parts.slice(0, parts.length - 2);
        barangays = barangayParts.map(b => b.replace(/^(Brgy\.|Sitio)\s*/, ''));
    }
    
    // Legacy single string support (joins multiple with comma)
    const barangay = barangays.join(', ');

    return { region: "", province, municipality, barangay, barangays };
};

const LocationPicker: React.FC<LocationPickerProps> = ({ value, onChange, onRegionChange, required = false, allowOnline = false }) => {
    // Data Lists
    const [regions, setRegions] = useState<LocationItem[]>([]);
    const [provinces, setProvinces] = useState<LocationItem[]>([]);
    const [cities, setCities] = useState<LocationItem[]>([]);
    const [barangays, setBarangays] = useState<LocationItem[]>([]);
    const [allProvinces, setAllProvinces] = useState<any[]>([]); // For reverse lookup

    // Selected Codes/Names
    const [selectedRegionCode, setSelectedRegionCode] = useState('');
    const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
    const [selectedCityCode, setSelectedCityCode] = useState('');
    const [selectedBarangayNames, setSelectedBarangayNames] = useState<string[]>([]);
    
    const [isOnline, setIsOnline] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Initial Data Fetch
    useEffect(() => {
        const fetchInitial = async () => {
            try {
                const [regionsRes, allProvincesRes] = await Promise.all([
                    fetch(`${API_BASE}/regions/`),
                    fetch(`${API_BASE}/provinces/`)
                ]);
                const regionsData = await regionsRes.json();
                const allProvincesData = await allProvincesRes.json();
                
                // Sort
                regionsData.sort((a: any, b: any) => a.name.localeCompare(b.name));
                setRegions(regionsData);
                setAllProvinces(allProvincesData);
                setIsLoading(false);
            } catch (err) {
                console.error("Failed to load initial location data", err);
                setIsLoading(false);
            }
        };
        fetchInitial();
    }, []);

    // Reverse Lookup / Initialization from String Value
    useEffect(() => {
        if (value === 'Online' && allowOnline) {
            setIsOnline(true);
            return;
        } else {
            setIsOnline(false);
        }

        if (!value || isLoading || allProvinces.length === 0) return;

        const { province, municipality, barangays: parsedBarangays } = parseLocation(value);
        
        // Match Province
        const matchedProvince = allProvinces.find(p => p.name.toLowerCase() === province.toLowerCase());
        
        if (matchedProvince) {
            // Found Province -> Set Region and Province
            if (matchedProvince.regionCode !== selectedRegionCode) {
                setSelectedRegionCode(matchedProvince.regionCode);
                // Trigger fetch provinces for this region
                fetch(`${API_BASE}/regions/${matchedProvince.regionCode}/provinces/`)
                    .then(res => res.json())
                    .then(data => {
                        data.sort((a: any, b: any) => a.name.localeCompare(b.name));
                        setProvinces(data);
                        setSelectedProvinceCode(matchedProvince.code);
                    });
            } else if (matchedProvince.code !== selectedProvinceCode) {
                 setSelectedProvinceCode(matchedProvince.code);
            }

            // Fetch Cities
            if (matchedProvince.code) {
                 fetch(`${API_BASE}/provinces/${matchedProvince.code}/cities-municipalities/`)
                    .then(res => res.json())
                    .then(data => {
                        data.sort((a: any, b: any) => a.name.localeCompare(b.name));
                        setCities(data);
                        // Find city code
                        const matchedCity = data.find((c: any) => c.name.toLowerCase() === municipality.toLowerCase());
                        if (matchedCity) {
                            setSelectedCityCode(matchedCity.code);
                            // Fetch Barangays
                            fetch(`${API_BASE}/cities-municipalities/${matchedCity.code}/barangays/`)
                                .then(res => res.json())
                                .then(bData => {
                                    bData.sort((a: any, b: any) => a.name.localeCompare(b.name));
                                    setBarangays(bData);
                                    // Match Barangays
                                    // We filter parsedBarangays to ensure they roughly exist or keep text if not
                                    setSelectedBarangayNames(parsedBarangays);
                                });
                        }
                    });
            }
        } else {
            // NCR Handling
            if (regions.length > 0) {
                const ncr = regions.find(r => r.code === '130000000'); // NCR Code
                if (ncr) {
                     if (!province || province === 'Metro Manila') {
                         fetch(`${API_BASE}/regions/130000000/cities-municipalities/`)
                            .then(res => res.json())
                            .then(data => {
                                const matchedCity = data.find((c: any) => c.name.toLowerCase() === municipality.toLowerCase());
                                if (matchedCity) {
                                    setSelectedRegionCode('130000000');
                                    setProvinces([]);
                                    setCities(data.sort((a: any, b: any) => a.name.localeCompare(b.name)));
                                    setSelectedCityCode(matchedCity.code);
                                     // Fetch Barangays
                                    fetch(`${API_BASE}/cities-municipalities/${matchedCity.code}/barangays/`)
                                        .then(res => res.json())
                                        .then(bData => {
                                            bData.sort((a: any, b: any) => a.name.localeCompare(b.name));
                                            setBarangays(bData);
                                            setSelectedBarangayNames(parsedBarangays);
                                        });
                                }
                            });
                     }
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, isLoading, allProvinces]);

    const constructLocationString = (cityCode: string, provCode: string, brgys: string[]) => {
        const city = cities.find(c => c.code === cityCode);
        const province = provinces.find(p => p.code === provCode);
        
        let locString = '';
        if (city) {
            const brgyPart = brgys.length > 0 ? brgys.map(b => `Brgy. ${b}`).join(', ') + ', ' : '';
            if (province) {
                locString = `${brgyPart}${city.name}, ${province.name}`;
            } else {
                // NCR or HUC
                locString = `${brgyPart}${city.name}`; 
                // Maybe append region if needed, but keeping it simple as per parse logic
            }
        }
        return locString;
    };
    
    // Handlers
    const handleRegionChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const code = e.target.value;
        setSelectedRegionCode(code);
        
        setProvinces([]);
        setCities([]);
        setBarangays([]);
        setSelectedProvinceCode('');
        setSelectedCityCode('');
        setSelectedBarangayNames([]);
        
        if (onRegionChange) {
            const region = regions.find(r => r.code === code);
            if (region) onRegionChange(region.name);
            else if (code === 'Online') onRegionChange('Online');
            else onRegionChange('');
        }

        if (code === 'Online') {
            setIsOnline(true);
            onChange('Online');
            return;
        } else {
            setIsOnline(false);
            if (!code) {
                onChange('');
                return;
            }
        }

        try {
            const res = await fetch(`${API_BASE}/regions/${code}/provinces/`);
            const data = await res.json();
            data.sort((a: any, b: any) => a.name.localeCompare(b.name));
            
            if (data.length === 0) {
                const citiesRes = await fetch(`${API_BASE}/regions/${code}/cities-municipalities/`);
                const citiesData = await citiesRes.json();
                citiesData.sort((a: any, b: any) => a.name.localeCompare(b.name));
                setCities(citiesData);
            } else {
                setProvinces(data);
            }
        } catch (err) {
            console.error("Error fetching provinces/cities", err);
        }
        onChange('');
    };

    const handleProvinceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const code = e.target.value;
        setSelectedProvinceCode(code);
        
        setCities([]);
        setBarangays([]);
        setSelectedCityCode('');
        setSelectedBarangayNames([]);
        
        if (!code) {
            onChange('');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/provinces/${code}/cities-municipalities/`);
            const data = await res.json();
            data.sort((a: any, b: any) => a.name.localeCompare(b.name));
            setCities(data);
        } catch (err) {
            console.error("Error fetching cities", err);
        }
        onChange('');
    };

    const handleCityChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const code = e.target.value;
        setSelectedCityCode(code);
        
        setBarangays([]);
        setSelectedBarangayNames([]);
        
        if (!code) {
            onChange('');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/cities-municipalities/${code}/barangays/`);
            const data = await res.json();
            data.sort((a: any, b: any) => a.name.localeCompare(b.name));
            setBarangays(data);
        } catch (err) {
            console.error("Error fetching barangays", err);
        }
        
        const loc = constructLocationString(code, selectedProvinceCode, []);
        onChange(loc);
    };

    const handleAddBarangay = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const name = e.target.value;
        if (!name) return;
        
        if (!selectedBarangayNames.includes(name)) {
            const newBarangays = [...selectedBarangayNames, name];
            setSelectedBarangayNames(newBarangays);
            const loc = constructLocationString(selectedCityCode, selectedProvinceCode, newBarangays);
            onChange(loc);
        }
        // Reset select to default
        e.target.value = "";
    };

    const handleRemoveBarangay = (name: string) => {
        const newBarangays = selectedBarangayNames.filter(b => b !== name);
        setSelectedBarangayNames(newBarangays);
        const loc = constructLocationString(selectedCityCode, selectedProvinceCode, newBarangays);
        onChange(loc);
    };

    const commonClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm disabled:bg-gray-200 dark:disabled:bg-gray-600";

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Region</label>
                <select 
                    value={isOnline ? 'Online' : selectedRegionCode} 
                    onChange={handleRegionChange} 
                    required={required} 
                    className={commonClasses}
                    disabled={isLoading}
                >
                    <option value="">Select Region</option>
                    {allowOnline && <option value="Online">Online</option>}
                    {regions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
            </div>
            {!isOnline && (
                <>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Province</label>
                        <select 
                            value={selectedProvinceCode} 
                            onChange={handleProvinceChange} 
                            required={required && provinces.length > 0} 
                            disabled={!selectedRegionCode || provinces.length === 0} 
                            className={commonClasses}
                        >
                            <option value="">{provinces.length === 0 && selectedRegionCode ? "N/A (e.g. NCR)" : "Select Province"}</option>
                            {provinces.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">City/Municipality</label>
                        <select 
                            value={selectedCityCode} 
                            onChange={handleCityChange} 
                            required={required} 
                            disabled={(!selectedProvinceCode && provinces.length > 0) || cities.length === 0} 
                            className={commonClasses}
                        >
                            <option value="">Select City/Municipality</option>
                            {cities.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Barangay(s)</label>
                        <select 
                            onChange={handleAddBarangay} 
                            disabled={!selectedCityCode || barangays.length === 0} 
                            className={commonClasses}
                            defaultValue=""
                        >
                            <option value="">Add Barangay...</option>
                            {barangays.map(b => <option key={b.code} value={b.name}>{b.name}</option>)}
                        </select>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {selectedBarangayNames.map(b => (
                                <span key={b} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200">
                                    {b}
                                    <button 
                                        type="button" 
                                        onClick={() => handleRemoveBarangay(b)} 
                                        className="ml-1 text-gray-500 hover:text-red-500 focus:outline-none"
                                    >
                                        &times;
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default LocationPicker;
