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
export const parseLocation = (location: string): { region: string; province: string; municipality: string; barangay: string } => {
    if (!location || location === "Online") {
        return { region: location === "Online" ? "Online" : "", province: "", municipality: "", barangay: "" };
    }
    const parts = location.split(',').map(p => p.trim());
    
    let barangay = '', municipality = '', province = '';

    if (parts.length === 2) {
      municipality = parts[0];
      province = parts[1];
    } else if (parts.length >= 3) {
      province = parts[parts.length - 1];
      municipality = parts[parts.length - 2];
      barangay = parts[parts.length - 3].replace(/^(Brgy\.|Sitio)\s*/, '');
    }
    
    // Region is not stored in location string, so return empty or inferred if possible (but tricky without map)
    return { region: "", province, municipality, barangay };
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
    const [selectedBarangayName, setSelectedBarangayName] = useState('');
    
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

        // If user is manually selecting, we don't want to overwrite unless value changes externally (e.g. initial load)
        // Simple check: construct current string and see if it matches value
        // But here we want to populate dropdowns FROM string.
        
        const { province, municipality, barangay } = parseLocation(value);
        
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
                                    const matchedBrgy = bData.find((b: any) => b.name.toLowerCase() === barangay.toLowerCase());
                                    if(matchedBrgy) setSelectedBarangayName(matchedBrgy.name);
                                    else setSelectedBarangayName(barangay); // Fallback to text if not found in list but present in string
                                });
                        }
                    });
            }
        } else {
            // Province not found (Maybe NCR District or HUC independent of province in list?)
            // NCR Handling: Check if municipality matches a city in NCR
            if (regions.length > 0) {
                const ncr = regions.find(r => r.code === '130000000'); // NCR Code
                if (ncr) {
                     // Check if it's in NCR cities
                     // This is a bit expensive to check every time, but necessary for HUCs/NCR reverse lookup without full database
                     // Optimization: If province is empty or 'Metro Manila' or similar
                     if (!province || province === 'Metro Manila') {
                         // Assume NCR for now or try to find city in NCR
                         fetch(`${API_BASE}/regions/130000000/cities-municipalities/`)
                            .then(res => res.json())
                            .then(data => {
                                const matchedCity = data.find((c: any) => c.name.toLowerCase() === municipality.toLowerCase());
                                if (matchedCity) {
                                    setSelectedRegionCode('130000000');
                                    setProvinces([]); // NCR has no provinces in this API context usually
                                    setCities(data.sort((a: any, b: any) => a.name.localeCompare(b.name)));
                                    setSelectedCityCode(matchedCity.code);
                                     // Fetch Barangays
                                    fetch(`${API_BASE}/cities-municipalities/${matchedCity.code}/barangays/`)
                                        .then(res => res.json())
                                        .then(bData => {
                                            bData.sort((a: any, b: any) => a.name.localeCompare(b.name));
                                            setBarangays(bData);
                                            setSelectedBarangayName(barangay);
                                        });
                                }
                            });
                     }
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, isLoading, allProvinces]); // Careful with deps loop

    
    // Handlers
    const handleRegionChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const code = e.target.value;
        setSelectedRegionCode(code);
        
        // Reset downstream
        setProvinces([]);
        setCities([]);
        setBarangays([]);
        setSelectedProvinceCode('');
        setSelectedCityCode('');
        setSelectedBarangayName('');
        
        // Report region name change
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

        // Fetch Provinces (or Cities for NCR)
        try {
            const res = await fetch(`${API_BASE}/regions/${code}/provinces/`);
            const data = await res.json();
            data.sort((a: any, b: any) => a.name.localeCompare(b.name));
            
            if (data.length === 0) {
                // E.g. NCR, fetch cities directly
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
        
        onChange(''); // Incomplete location
    };

    const handleProvinceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const code = e.target.value;
        setSelectedProvinceCode(code);
        
        setCities([]);
        setBarangays([]);
        setSelectedCityCode('');
        setSelectedBarangayName('');
        
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
        setSelectedBarangayName('');
        
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
        
        // Update string if province is selected (partial update?) -> No, usually full string needed
        // Just wait for Barangay? Or allow City, Prov?
        // Current format convention: Brgy, City, Province
        // If we want to allow partials, we can construct here. But usually Brgy is required.
        // Let's construct what we have.
        const city = cities.find(c => c.code === code);
        const province = provinces.find(p => p.code === selectedProvinceCode);
        
        if (city && province) {
             onChange(`${city.name}, ${province.name}`);
        } else if (city && !province) {
             // NCR case
             onChange(`${city.name}`); // Maybe append Metro Manila? Usually handled by region context
        }
    };

    const handleBarangayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const name = e.target.value;
        setSelectedBarangayName(name);
        
        if (!name) return;

        const city = cities.find(c => c.code === selectedCityCode);
        const province = provinces.find(p => p.code === selectedProvinceCode);
        
        let locString = '';
        if (province) {
            locString = `Brgy. ${name}, ${city?.name}, ${province.name}`;
        } else {
            // NCR or HUC
            locString = `Brgy. ${name}, ${city?.name}`; // Often formatted as City, Metro Manila
            // Check if Region is NCR to append context?
            if (selectedRegionCode === '130000000') {
                 // Optional: Append Metro Manila
            }
        }
        onChange(locString);
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Barangay</label>
                        <select 
                            value={selectedBarangayName} 
                            onChange={handleBarangayChange} 
                            disabled={!selectedCityCode || barangays.length === 0} 
                            className={commonClasses}
                        >
                            <option value="">Select Barangay</option>
                            {barangays.map(b => <option key={b.code} value={b.name}>{b.name}</option>)}
                        </select>
                    </div>
                </>
            )}
        </div>
    );
};

export default LocationPicker;