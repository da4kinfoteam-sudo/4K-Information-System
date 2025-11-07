import React, { useState, useEffect, useMemo } from 'react';
import { philippineLocations } from '../constants';

interface LocationPickerProps {
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    allowOnline?: boolean;
}

const allRegions = Object.keys(philippineLocations);

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
    
    let region = "";
    for (const reg of allRegions) {
        if (philippineLocations[reg] && Object.keys(philippineLocations[reg]).includes(province)) {
            region = reg;
            break;
        }
    }

    return { region, province, municipality, barangay };
};

const LocationPicker: React.FC<LocationPickerProps> = ({ value, onChange, required = false, allowOnline = false }) => {
    const [selectedRegion, setSelectedRegion] = useState('');
    const [selectedProvince, setSelectedProvince] = useState('');
    const [selectedMunicipality, setSelectedMunicipality] = useState('');
    const [selectedBarangay, setSelectedBarangay] = useState('');

    const regions = useMemo(() => {
        if (allowOnline) {
            return allRegions;
        }
        return allRegions.filter(r => r !== 'Online');
    }, [allowOnline]);

    useEffect(() => {
        const { region, province, municipality, barangay } = parseLocation(value);
        setSelectedRegion(region);
        setSelectedProvince(province);
        setSelectedMunicipality(municipality);
        setSelectedBarangay(barangay);
    }, [value]);

    const provinces = useMemo(() => {
        return selectedRegion && philippineLocations[selectedRegion] ? Object.keys(philippineLocations[selectedRegion]) : [];
    }, [selectedRegion]);

    const municipalities = useMemo(() => {
        return selectedRegion && selectedProvince && philippineLocations[selectedRegion]?.[selectedProvince] 
            ? Object.keys(philippineLocations[selectedRegion][selectedProvince]) 
            : [];
    }, [selectedRegion, selectedProvince]);

    const barangays = useMemo(() => {
        return selectedRegion && selectedProvince && selectedMunicipality && philippineLocations[selectedRegion]?.[selectedProvince]?.[selectedMunicipality] 
            ? philippineLocations[selectedRegion][selectedProvince][selectedMunicipality] 
            : [];
    }, [selectedRegion, selectedProvince, selectedMunicipality]);
    
    const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const region = e.target.value;
        setSelectedRegion(region);
        setSelectedProvince('');
        setSelectedMunicipality('');
        setSelectedBarangay('');
        if (region === 'Online') {
            onChange('Online');
        } else if (!region) {
            onChange('');
        }
    };

    const handleProvinceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const province = e.target.value;
        setSelectedProvince(province);
        setSelectedMunicipality('');
        setSelectedBarangay('');
        onChange('');
    };

    const handleMunicipalityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const municipality = e.target.value;
        setSelectedMunicipality(municipality);
        setSelectedBarangay('');
        if (municipality && selectedProvince) {
            onChange(`${municipality}, ${selectedProvince}`);
        } else {
             onChange('');
        }
    };
    
    const handleBarangayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const barangay = e.target.value;
        setSelectedBarangay(barangay);
        if (barangay && selectedMunicipality && selectedProvince) {
            onChange(`Brgy. ${barangay}, ${selectedMunicipality}, ${selectedProvince}`);
        }
    };

    const commonClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Region</label>
                <select value={selectedRegion} onChange={handleRegionChange} required={required} className={commonClasses}>
                    <option value="">Select Region</option>
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
            </div>
            {selectedRegion !== 'Online' && (
                <>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Province</label>
                        <select value={selectedProvince} onChange={handleProvinceChange} required={required} disabled={!selectedRegion || provinces.length === 0} className={`${commonClasses} disabled:bg-gray-200 dark:disabled:bg-gray-600`}>
                            <option value="">Select Province</option>
                            {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Municipality</label>
                        <select value={selectedMunicipality} onChange={handleMunicipalityChange} required={required} disabled={!selectedProvince || municipalities.length === 0} className={`${commonClasses} disabled:bg-gray-200 dark:disabled:bg-gray-600`}>
                            <option value="">Select Municipality</option>
                            {municipalities.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Barangay</label>
                        <select value={selectedBarangay} onChange={handleBarangayChange} disabled={!selectedMunicipality || barangays.length === 0} className={`${commonClasses} disabled:bg-gray-200 dark:disabled:bg-gray-600`}>
                            <option value="">Select Barangay</option>
                            {barangays.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                </>
            )}
        </div>
    );
};

export default LocationPicker;