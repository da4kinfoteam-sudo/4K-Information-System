
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { objectTypes, GidaArea, ElcacArea, normalizeRegionName, IPO, RefCommodity, RefLivestock, RefEquipment, equipmentCategories, RefInput, RefInfrastructure, RefTrainingReference } from '../constants';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { parseLocation } from './LocationPicker';
import { usePagination } from './mainfunctions/TableHooks';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

// Data Structures matching the flattened state
export interface ReferenceUacs {
    id: string;
    objectType: string;
    particular: string;
    uacsCode: string;
    description: string;
}

export interface ReferenceParticular {
    id: string;
    type: string;
    particular: string;
}


interface ReferencesProps {
    uacsList: ReferenceUacs[];
    setUacsList: React.Dispatch<React.SetStateAction<ReferenceUacs[]>>;
    particularList: ReferenceParticular[];
    setParticularList: React.Dispatch<React.SetStateAction<ReferenceParticular[]>>;
    refCommodities: RefCommodity[];
    setRefCommodities: React.Dispatch<React.SetStateAction<RefCommodity[]>>;
    refLivestock: RefLivestock[];
    setRefLivestock: React.Dispatch<React.SetStateAction<RefLivestock[]>>;
    refEquipment: RefEquipment[];
    setRefEquipment: React.Dispatch<React.SetStateAction<RefEquipment[]>>;
    refInputs: RefInput[];
    setRefInputs: React.Dispatch<React.SetStateAction<RefInput[]>>;
    refInfrastructure: RefInfrastructure[];
    setRefInfrastructure: React.Dispatch<React.SetStateAction<RefInfrastructure[]>>;
    refTrainings: RefTrainingReference[];
    setRefTrainings: React.Dispatch<React.SetStateAction<RefTrainingReference[]>>;
    gidaList: GidaArea[];
    setGidaList: React.Dispatch<React.SetStateAction<GidaArea[]>>;
    elcacList: ElcacArea[];
    setElcacList: React.Dispatch<React.SetStateAction<ElcacArea[]>>;
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
}

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const CROP_TOOLTIPS = {
    name: "The specific variety or common name (e.g. \"NSIC Rice Rc222\" or \"Carabao Mango\").",
    banner_program: "The DA Banner Program managing the budget (Rice, Corn, HVCDP, or Coconut).",
    commodity_group: "The biological or economic group (e.g. Cereal, Vegetable, Fruit, Industrial).",
    min_elevation_masl: "Minimum altitude required in Meters Above Sea Level (MASL).",
    max_elevation_masl: "Maximum altitude limit; exceeding this may result in poor growth or no fruiting.",
    max_slope_percent: "Maximum terrain steepness; used to prevent erosion and ensure machinery access.",
    ph_min: "The most acidic soil condition the crop can tolerate (Standard range: 0.0 - 14.0).",
    ph_max: "The most alkaline soil condition allowed; critical for nutrient absorption.",
    climate_type_suitability: "PAGASA Climate Types (I-IV) suitable for the crop based on rainfall distribution.",
    wet_season_start: "The ideal month(s) to start planting during the rainy season.",
    dry_season_start: "The ideal month(s) to start planting during the sunnier/drier months.",
    harvest_period_days: "Estimated days from planting or transplanting to the first major harvest.",
    recommended_soil: "Preferred soil type (e.g. \"Sandy Loam\", \"Clay Loam\") for optimal root development.",
    fertilizer_npk: "Suggested Nitrogen-Phosphorus-Potassium (N-P-K) grades and application timing.",
    watering_method: "Recommended water delivery (e.g. \"Rainfed\", \"Drip\", \"Flooded\", \"Basin\").",
    target_yield_ha: "Expected output in Metric Tons per Hectare under optimal management."
};

const LIVESTOCK_TOOLTIPS = {
    name: "The specific breed or variety (e.g. \"Native Chicken - Darag\" or \"Dairy Cow - Girolando\").",
    category: "Broad classification of the animal (e.g. Poultry, Swine, Ruminant, or Small Livestock).",
    breed_type: "Specific genetic line (e.g. Native, Heritage, Upgraded, or Industrial/Hybrid).",
    min_space_sqm_per_head: "Minimum floor area required per animal for health and welfare standards.",
    housing_type: "Recommended structure (e.g. \"Elevated Slatted Floor\", \"Free-range\", or \"Battery Cages\").",
    min_temp_celsius: "Lowest temperature limit; below this requires brooding or heating equipment.",
    max_temp_celsius: "Highest temperature limit; exceeding this leads to heat stress and production loss.",
    gestation_incubation_days: "Days from conception to birth (Livestock) or from setting to hatching (Poultry).",
    maturity_days: "Days from birth/hatch until the animal reaches target weight or begins production.",
    productive_years: "Estimated years the animal remains profitable (applies to layers, breeders, or dairy).",
    feed_type: "Primary nutrition required (e.g. \"Layer Pellets\", \"High-Protein Forage\", or \"TMR\").",
    target_fcr: "Feed Conversion Ratio: Kilograms of feed needed to produce 1kg of meat or product.",
    water_liters_per_day: "Minimum fresh water required per animal per day; critical for dairy and layers.",
    target_weight_kg: "The ideal goal weight at the end of the maturity period for slaughter or sale.",
    avg_eggs_per_year: "Expected total egg production per female bird per year under optimal management."
};

const EQUIPMENT_TOOLTIPS = {
    name: "The specific name of the tool or machine (e.g. \"Hand Tractor\" or \"Rice Reaper\").",
    category: "The stage of farming where it is used (e.g. Land Preparation, Post-Harvest).",
    equipment_type: "Classification: Manual Tool, Power Machinery (Engine-driven), or Attachment/Implement.",
    power_source: "The engine type or energy source required (e.g. \"7hp Diesel\" or \"Manual/Hand\").",
    capacity_rating: "The performance output (e.g. \"Hectares per day\" or \"Kilograms per hour\").",
    fuel_consumption_rate: "Estimated fuel usage per hour of operation; used for calculating operational costs.",
    estimated_useful_life_years: "The expected number of years the equipment remains operational before replacement.",
    unit_cost_estimate: "Standard market price used for project budgeting and procurement planning.",
    maintenance_interval_months: "Recommended frequency for technical maintenance and oil changes (in months).",
    required_operators: "Number of persons required to safely operate the equipment.",
    safety_gear_required: "Personal Protective Equipment needed (e.g. \"Rubber Boots, Heavy Duty Gloves\")."
};

const INPUT_TOOLTIPS = {
    input_type: "Broad classification of the agricultural input (e.g. Fertilizer, Seed, Pesticide).",
    sub_type: "The specific grade of the input (e.g. 'Inorganic' for chemicals or 'Heirloom' for traditional seeds).",
    name: "The commercial or common name of the product.",
    standard_uom: "The standard unit used for procurement and inventory (e.g. 50kg bag; 1L bottle; or 1kg pack).",
    avg_price_2026: "The current regional market price used for project budgeting and fund allocation.",
    fpa_registration_no: "The mandatory regulatory code from FPA or BAI ensuring the product is safe and legal for use.",
    shelf_life_months: "The number of months the product remains effective from the date of manufacture.",
    application_rate_per_ha: "Recommended quantity to be used per hectare for optimal results.",
    hazchem_rating: "Hazardous chemical classification for safety and storage handling (e.g. 'Category IV - Blue')."
};

const INFRASTRUCTURE_TOOLTIPS = {
    name: "The standard name of the infrastructure project.",
    category: "The primary classification of the structure (e.g. Post-Harvest, Nursery, Livestock).",
    structure_type: "The specific design or material used (e.g. 'Concrete/Steel', 'GI Pipe/Mesh').",
    capacity_rating: "The size or output capacity (e.g. '5000 Bags', '10 Metric Tons').",
    estimated_useful_life_years: "The expected number of years the structure will remain functional.",
    unit_cost_estimate: "The current standard cost used for feasibility and budgeting.",
    maintenance_interval_months: "How often technical maintenance is required in months.",
    required_permits: "List of necessary documents (e.g. ECC, Building Permit, DAR Clearance)."
};

const TRAINING_TOOLTIPS = {
    title: "The official name of the training program",
    category: "The thematic area of the training (e.g., Crops, Livestock, Institutional, Post-Harvest)",
    standard_duration_days: "The default number of days for the training",
    delivery_mode: "How the training is delivered (Face-to-Face, Blended, Virtual)",
    target_audience: "The primary group the training is intended for",
    accrediting_body: "The organization that accredits the training (default: DA-ATI)",
    minimum_participants: "The minimum number of attendees required",
    required_facilities: "Facilities needed for the training (e.g., Demo Farm, Training Room)",
    key_modules: "Main topics or modules covered in the training",
    expected_competency: "Skills or knowledge participants are expected to gain",
    certification_type: "Type of certificate issued (e.g., Certificate of Completion, NC II)"
};

const References: React.FC<ReferencesProps> = ({ uacsList, setUacsList, particularList, setParticularList, refCommodities, setRefCommodities, refLivestock, setRefLivestock, refEquipment, setRefEquipment, refInputs, setRefInputs, refInfrastructure, setRefInfrastructure, refTrainings, setRefTrainings, gidaList, setGidaList, elcacList, setElcacList, ipos, setIpos }) => {
    const { currentUser } = useAuth();
    const [activeGroup, setActiveGroup] = useState<'DCF Reference' | 'Commodity References' | 'Intervention References' | 'Policy References'>('DCF Reference');
    const [activeTab, setActiveTab] = useState<'UACS' | 'Items' | 'Crop Reference' | 'Livestock Reference' | 'Equipment Reference' | 'Agricultural Input Reference' | 'Infrastructure Reference' | 'Training Reference' | 'GIDA' | 'ELCAC'>('UACS');
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [deleteItem, setDeleteItem] = useState<any>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Sorting State
    type SortConfig = { key: string; direction: 'ascending' | 'descending' } | null;
    const [sortConfig, setSortConfig] = useState<SortConfig>(null);

    // Multi-Delete State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isMultiDeleteModalOpen, setIsMultiDeleteModalOpen] = useState(false);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

    // Access Control: User role is Read-Only
    const canEdit = currentUser?.role !== 'User';

    // --- UACS Form State ---
    const [uacsForm, setUacsForm] = useState({
        objectType: 'MOOE',
        particular: '',
        uacsCode: '',
        description: ''
    });

    // --- Items Form State ---
    const [itemForm, setItemForm] = useState({
        type: '',
        particular: ''
    });

    // --- Crop References Form State ---
    const [refCommodityForm, setRefCommodityForm] = useState({
        name: '',
        banner_program: '',
        commodity_group: '',
        min_elevation_masl: 0,
        max_elevation_masl: 0,
        max_slope_percent: 0,
        wet_season_start: '',
        dry_season_start: '',
        recommended_soil: '',
        fertilizer_npk: '',
        watering_method: '',
        harvest_period_days: 0,
        ph_min: 0,
        ph_max: 0,
        climate_type_suitability: '',
        target_yield_ha: 0
    });

    // --- Livestock References Form State ---
    const [refLivestockForm, setRefLivestockForm] = useState({
        name: '',
        category: 'Poultry' as 'Poultry' | 'Ruminant' | 'Swine' | 'Small Livestock',
        breed_type: '',
        min_space_sqm_per_head: 0,
        housing_type: '',
        min_temp_celsius: 0,
        max_temp_celsius: 0,
        gestation_incubation_days: 0,
        maturity_days: 0,
        productive_years: 0,
        feed_type: '',
        target_fcr: 0,
        water_liters_per_day: 0,
        target_weight_kg: 0,
        avg_eggs_per_year: 0
    });

    // --- Equipment References Form State ---
    const [refEquipmentForm, setRefEquipmentForm] = useState({
        name: '',
        category: '',
        equipment_type: '',
        power_source: '',
        capacity_rating: '',
        fuel_consumption_rate: 0,
        estimated_useful_life_years: 0,
        unit_cost_estimate: 0,
        maintenance_interval_months: 0,
        required_operators: 1,
        safety_gear_required: ''
    });

    // --- Agricultural Input Form State ---
    const [refInputForm, setRefInputForm] = useState({
        input_type: '',
        sub_type: '',
        name: '',
        standard_uom: '',
        avg_price_2026: 0,
        fpa_registration_no: '',
        shelf_life_months: 0,
        application_rate_per_ha: 0,
        hazchem_rating: ''
    });

    // --- Infrastructure Form State ---
    const [refInfrastructureForm, setRefInfrastructureForm] = useState({
        name: '',
        category: '',
        structure_type: '',
        capacity_rating: '',
        estimated_useful_life_years: 10,
        unit_cost_estimate: 0,
        maintenance_interval_months: 12,
        required_permits: ''
    });

    // --- Trainings Form State ---
    const [refTrainingForm, setRefTrainingForm] = useState<RefTrainingReference>({
        title: '',
        category: '',
        standard_duration_days: 3,
        delivery_mode: 'Face-to-Face',
        target_audience: '',
        accrediting_body: 'DA-ATI',
        minimum_participants: 15,
        required_facilities: '',
        key_modules: '',
        expected_competency: '',
        certification_type: ''
    });

    // --- GIDA Form State ---
    const [gidaForm, setGidaForm] = useState({
        region: '',
        province: '',
        municipality: '',
        barangay: ''
    });

    // --- ELCAC Form State ---
    const [elcacForm, setElcacForm] = useState({
        region: '',
        province: '',
        municipality: '',
        barangay: ''
    });

    const handleRetroactiveGidaUpdate = async () => {
        if (!supabase) return;
        if (!window.confirm("This will check all IPOs and update their 'Within GIDA Areas' status based on the current GIDA list. Continue?")) return;

        setIsUploading(true);
        try {
            const updates = ipos.map(ipo => {
                const { province, municipality, barangays } = parseLocation(ipo.location);
                const isWithinGida = gidaList.some(g => 
                    g.region === ipo.region &&
                    g.province.toLowerCase() === province.toLowerCase() &&
                    g.municipality.toLowerCase() === municipality.toLowerCase() &&
                    barangays.some(b => b.toLowerCase() === g.barangay.toLowerCase())
                );

                if (isWithinGida && !ipo.isWithinGida) {
                    return { ...ipo, isWithinGida: true };
                }
                return null;
            }).filter(Boolean) as IPO[];

            if (updates.length === 0) {
                alert("No IPOs found that need updating.");
                return;
            }

            // Update in Supabase
            for (const ipo of updates) {
                await supabase.from('ipos').update({ isWithinGida: true }).eq('id', ipo.id);
            }

            // Update local state
            setIpos(prev => prev.map(ipo => {
                const match = updates.find(u => u.id === ipo.id);
                return match ? match : ipo;
            }));

            alert(`Successfully updated ${updates.length} IPOs.`);
        } catch (error: any) {
            console.error("Error during retroactive GIDA update:", error);
            alert(`Failed to update IPOs: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleRetroactiveElcacUpdate = async () => {
        if (!supabase) return;
        if (!window.confirm("This will check all IPOs and update their 'Within ELCAC Areas' status based on the current ELCAC list. Continue?")) return;

        setIsUploading(true);
        try {
            const updates = ipos.map(ipo => {
                const { province, municipality, barangays } = parseLocation(ipo.location);
                const isWithinElcac = elcacList.some(e => 
                    e.region === ipo.region &&
                    e.province.toLowerCase() === province.toLowerCase() &&
                    e.municipality.toLowerCase() === municipality.toLowerCase() &&
                    barangays.some(b => b.toLowerCase() === e.barangay.toLowerCase())
                );

                if (isWithinElcac && !ipo.isWithinElcac) {
                    return { ...ipo, isWithinElcac: true };
                }
                return null;
            }).filter(Boolean) as IPO[];

            if (updates.length === 0) {
                alert("No IPOs found that need updating.");
                return;
            }

            // Update in Supabase
            for (const ipo of updates) {
                await supabase.from('ipos').update({ isWithinElcac: true }).eq('id', ipo.id);
            }

            // Update local state
            setIpos(prev => prev.map(ipo => {
                const match = updates.find(u => u.id === ipo.id);
                return match ? match : ipo;
            }));

            alert(`Successfully updated ${updates.length} IPOs.`);
        } catch (error: any) {
            console.error("Error during retroactive ELCAC update:", error);
            alert(`Failed to update IPOs: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    // Reset selection mode and sort on tab change
    useEffect(() => {
        setIsSelectionMode(false);
        setSelectedIds([]);
        setSortConfig(null);
    }, [activeTab]);

    // --- Sorting Logic ---
    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const SortableHeader = ({ label, sortKey, tooltip }: { label: string; sortKey: string; tooltip?: string }) => {
        const isSorted = sortConfig?.key === sortKey;
        const directionIcon = isSorted ? (sortConfig?.direction === 'ascending' ? '▲' : '▼') : '↕';
        return (
            <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group select-none"
                onClick={() => requestSort(sortKey)}
                title={tooltip}
            >
                <div className="flex items-center gap-1">
                    {label}
                    {tooltip && <Info className="h-3 w-3 text-gray-400 group-hover:text-emerald-500 transition-colors" />}
                    <span className={`text-xs ${isSorted ? 'text-emerald-600 opacity-100' : 'text-gray-400 opacity-0 group-hover:opacity-50'}`}>{directionIcon}</span>
                </div>
            </th>
        );
    };

    // --- Filtering & Sorting ---
    const processedUacs = useMemo(() => {
        let items = [...uacsList];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                i.uacsCode.toLowerCase().includes(lower) || 
                i.description.toLowerCase().includes(lower) || 
                i.particular.toLowerCase().includes(lower) ||
                (i.objectType && i.objectType.toLowerCase().includes(lower))
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [uacsList, searchTerm, sortConfig]);

    const processedParticulars = useMemo(() => {
        let items = [...particularList];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                i.particular.toLowerCase().includes(lower) || 
                i.type.toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [particularList, searchTerm, sortConfig]);

    const processedRefCommodities = useMemo(() => {
        let items = [...refCommodities];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                (i.name || '').toLowerCase().includes(lower) || 
                (i.banner_program || '').toLowerCase().includes(lower) ||
                (i.commodity_group || '').toLowerCase().includes(lower) ||
                (i.recommended_soil || '').toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [refCommodities, searchTerm, sortConfig]);

    const processedRefLivestock = useMemo(() => {
        let items = [...refLivestock];
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                (i.name || '').toLowerCase().includes(lower) ||
                (i.category || '').toLowerCase().includes(lower) ||
                (i.breed_type || '').toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [refLivestock, searchTerm, sortConfig]);

    const processedRefEquipment = useMemo(() => {
        let items = [...refEquipment];
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                (i.name || '').toLowerCase().includes(lower) ||
                (i.category || '').toLowerCase().includes(lower) ||
                (i.equipment_type || '').toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [refEquipment, searchTerm, sortConfig]);

    const processedRefInputs = useMemo(() => {
        let items = [...refInputs];
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                (i.name || '').toLowerCase().includes(lower) ||
                (i.input_type || '').toLowerCase().includes(lower) ||
                (i.sub_type || '').toLowerCase().includes(lower)
            );
        }
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [refInputs, searchTerm, sortConfig]);

    const processedRefInfrastructure = useMemo(() => {
        let items = [...refInfrastructure];
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                (i.name || '').toLowerCase().includes(lower) ||
                (i.category || '').toLowerCase().includes(lower) ||
                (i.structure_type || '').toLowerCase().includes(lower)
            );
        }
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [refInfrastructure, searchTerm, sortConfig]);

    const processedRefTrainings = useMemo(() => {
        let items = [...refTrainings];
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                (i.title || '').toLowerCase().includes(lower) ||
                (i.category || '').toLowerCase().includes(lower)
            );
        }
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [refTrainings, searchTerm, sortConfig]);

    const processedGida = useMemo(() => {
        let items = [...gidaList];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                i.region.toLowerCase().includes(lower) || 
                i.province.toLowerCase().includes(lower) ||
                i.municipality.toLowerCase().includes(lower) ||
                i.barangay.toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [gidaList, searchTerm, sortConfig]);

    const processedElcac = useMemo(() => {
        let items = [...elcacList];
        // Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter(i => 
                i.region.toLowerCase().includes(lower) || 
                i.province.toLowerCase().includes(lower) ||
                i.municipality.toLowerCase().includes(lower) ||
                i.barangay.toLowerCase().includes(lower)
            );
        }
        // Sort
        if (sortConfig) {
            items.sort((a: any, b: any) => {
                const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
                const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [elcacList, searchTerm, sortConfig]);

    const activeData = useMemo(() => {
        switch (activeTab) {
            case 'UACS': return processedUacs;
            case 'Items': return processedParticulars;
            case 'Crop Reference': return processedRefCommodities;
            case 'Livestock Reference': return processedRefLivestock;
            case 'Equipment Reference': return processedRefEquipment;
            case 'Agricultural Input Reference': return processedRefInputs;
            case 'Infrastructure Reference': return processedRefInfrastructure;
            case 'Training Reference': return processedRefTrainings;
            case 'GIDA': return processedGida;
            case 'ELCAC': return processedElcac;
            default: return [];
        }
    }, [activeTab, processedUacs, processedParticulars, processedRefCommodities, processedRefLivestock, processedRefEquipment, processedRefInputs, processedRefInfrastructure, processedRefTrainings, processedGida, processedElcac]);

    const {
        currentPage,
        setCurrentPage,
        itemsPerPage,
        setItemsPerPage,
        totalPages,
        paginatedData
    } = usePagination(activeData, [activeTab, searchTerm, sortConfig]);

    // --- Handlers ---
    const handleOpenAdd = () => {
        setEditingItem(null);
        setUacsForm({ objectType: 'MOOE', particular: '', uacsCode: '', description: '' });
        setItemForm({ type: '', particular: '' });
        setRefCommodityForm({
            name: '', banner_program: '', commodity_group: '', min_elevation_masl: 0, max_elevation_masl: 0,
            max_slope_percent: 0, wet_season_start: '', dry_season_start: '', recommended_soil: '',
            fertilizer_npk: '', watering_method: '', harvest_period_days: 0, ph_min: 0, ph_max: 0,
            climate_type_suitability: '', target_yield_ha: 0
        });
        setRefLivestockForm({
            name: '', category: 'Poultry', breed_type: '', min_space_sqm_per_head: 0, housing_type: '',
            min_temp_celsius: 0, max_temp_celsius: 0, gestation_incubation_days: 0, maturity_days: 0,
            productive_years: 0, feed_type: '', target_fcr: 0, water_liters_per_day: 0, target_weight_kg: 0,
            avg_eggs_per_year: 0
        });
        setRefEquipmentForm({
            name: '', category: '', equipment_type: '', power_source: '', capacity_rating: '',
            fuel_consumption_rate: 0, estimated_useful_life_years: 0, unit_cost_estimate: 0,
            maintenance_interval_months: 0, required_operators: 1, safety_gear_required: ''
        });
        setRefInputForm({
            input_type: '', sub_type: '', name: '', standard_uom: '', avg_price_2026: 0,
            fpa_registration_no: '', shelf_life_months: 0, application_rate_per_ha: 0, hazchem_rating: ''
        });
        setRefInfrastructureForm({
            name: '',
            category: '',
            structure_type: '',
            capacity_rating: '',
            estimated_useful_life_years: 10,
            unit_cost_estimate: 0,
            maintenance_interval_months: 12,
            required_permits: ''
        });
        setRefTrainingForm({
            title: '',
            category: '',
            standard_duration_days: 3,
            delivery_mode: 'Face-to-Face',
            target_audience: '',
            accrediting_body: 'DA-ATI',
            minimum_participants: 15,
            required_facilities: '',
            key_modules: '',
            expected_competency: '',
            certification_type: ''
        });
        setGidaForm({ region: '', province: '', municipality: '', barangay: '' });
        setElcacForm({ region: '', province: '', municipality: '', barangay: '' });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (item: any) => {
        setEditingItem(item);
        if (activeTab === 'UACS') {
            setUacsForm({
                objectType: item.objectType,
                particular: item.particular,
                uacsCode: item.uacsCode,
                description: item.description
            });
        } else if (activeTab === 'Items') {
            setItemForm({
                type: item.type,
                particular: item.particular
            });
        } else if (activeTab === 'Crop Reference') {
            setRefCommodityForm({
                name: item.name,
                banner_program: item.banner_program,
                commodity_group: item.commodity_group,
                min_elevation_masl: item.min_elevation_masl,
                max_elevation_masl: item.max_elevation_masl,
                max_slope_percent: item.max_slope_percent,
                wet_season_start: item.wet_season_start,
                dry_season_start: item.dry_season_start,
                recommended_soil: item.recommended_soil,
                fertilizer_npk: item.fertilizer_npk,
                watering_method: item.watering_method,
                harvest_period_days: item.harvest_period_days || 0,
                ph_min: item.ph_min || 0,
                ph_max: item.ph_max || 0,
                climate_type_suitability: item.climate_type_suitability || '',
                target_yield_ha: item.target_yield_ha || 0
            });
        } else if (activeTab === 'Livestock Reference') {
            setRefLivestockForm({
                name: item.name,
                category: item.category,
                breed_type: item.breed_type,
                min_space_sqm_per_head: item.min_space_sqm_per_head,
                housing_type: item.housing_type,
                min_temp_celsius: item.min_temp_celsius,
                max_temp_celsius: item.max_temp_celsius,
                gestation_incubation_days: item.gestation_incubation_days,
                maturity_days: item.maturity_days,
                productive_years: item.productive_years,
                feed_type: item.feed_type,
                target_fcr: item.target_fcr,
                water_liters_per_day: item.water_liters_per_day,
                target_weight_kg: item.target_weight_kg,
                avg_eggs_per_year: item.avg_eggs_per_year
            });
        } else if (activeTab === 'Equipment Reference') {
            setRefEquipmentForm({
                name: item.name,
                category: item.category,
                equipment_type: item.equipment_type,
                power_source: item.power_source,
                capacity_rating: item.capacity_rating,
                fuel_consumption_rate: item.fuel_consumption_rate,
                estimated_useful_life_years: item.estimated_useful_life_years,
                unit_cost_estimate: item.unit_cost_estimate,
                maintenance_interval_months: item.maintenance_interval_months,
                required_operators: item.required_operators,
                safety_gear_required: item.safety_gear_required
            });
        } else if (activeTab === 'Agricultural Input Reference') {
            setRefInputForm({
                input_type: item.input_type,
                sub_type: item.sub_type,
                name: item.name,
                standard_uom: item.standard_uom,
                avg_price_2026: item.avg_price_2026,
                fpa_registration_no: item.fpa_registration_no,
                shelf_life_months: item.shelf_life_months,
                application_rate_per_ha: item.application_rate_per_ha,
                hazchem_rating: item.hazchem_rating
            });
        } else if (activeTab === 'Infrastructure Reference') {
            setRefInfrastructureForm({
                name: item.name || '',
                category: item.category || '',
                structure_type: item.structure_type || '',
                capacity_rating: item.capacity_rating || '',
                estimated_useful_life_years: item.estimated_useful_life_years || 10,
                unit_cost_estimate: item.unit_cost_estimate || 0,
                maintenance_interval_months: item.maintenance_interval_months || 12,
                required_permits: item.required_permits || ''
            });
        } else if (activeTab === 'Training Reference') {
            const t = item as RefTrainingReference;
            setRefTrainingForm({
                id: t.id,
                title: t.title || '',
                category: t.category || '',
                standard_duration_days: t.standard_duration_days || 3,
                delivery_mode: t.delivery_mode || 'Face-to-Face',
                target_audience: t.target_audience || '',
                accrediting_body: t.accrediting_body || 'DA-ATI',
                minimum_participants: t.minimum_participants || 15,
                required_facilities: t.required_facilities || '',
                key_modules: t.key_modules || '',
                expected_competency: t.expected_competency || '',
                certification_type: t.certification_type || ''
            });
        } else if (activeTab === 'GIDA') {
            setGidaForm({
                region: item.region,
                province: item.province,
                municipality: item.municipality,
                barangay: item.barangay
            });
        } else {
            setElcacForm({
                region: item.region,
                province: item.province,
                municipality: item.municipality,
                barangay: item.barangay
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const id = editingItem ? editingItem.id : crypto.randomUUID();

        if (activeTab === 'UACS') {
            const newData = { id, ...uacsForm };
            if (editingItem) {
                setUacsList(prev => prev.map(i => i.id === id ? newData : i));
            } else {
                setUacsList(prev => [newData, ...prev]);
            }
        } else if (activeTab === 'Items') {
            const newData = { id, ...itemForm };
            if (editingItem) {
                setParticularList(prev => prev.map(i => i.id === id ? newData : i));
            } else {
                setParticularList(prev => [newData, ...prev]);
            }
        } else if (activeTab === 'Crop Reference') {
            const newData = { id, ...refCommodityForm };
            if (supabase) {
                if (editingItem) {
                    const { error } = await supabase.from('ref_commodities').update(refCommodityForm).eq('id', editingItem.id);
                    if (error) {
                        console.error("Error updating Crop reference:", error);
                        alert(`Failed to update Crop reference: ${error.message}`);
                        return;
                    }
                    setRefCommodities(prev => prev.map(i => i.id === editingItem.id ? { ...newData, id: editingItem.id } : i));
                } else {
                    const { data, error } = await supabase.from('ref_commodities').insert(refCommodityForm).select();
                    if (error) {
                        console.error("Error inserting Crop reference:", error);
                        alert(`Failed to add Crop reference: ${error.message}`);
                        return;
                    }
                    if (data && data.length > 0) {
                        setRefCommodities(prev => [data[0] as RefCommodity, ...prev]);
                    }
                }
            } else {
                if (editingItem) {
                    setRefCommodities(prev => prev.map(i => i.id === id ? newData : i));
                } else {
                    setRefCommodities(prev => [newData, ...prev]);
                }
            }
        } else if (activeTab === 'Livestock Reference') {
            const newData = { id, ...refLivestockForm };
            if (supabase) {
                if (editingItem) {
                    const { error } = await supabase.from('ref_livestock').update(refLivestockForm).eq('id', editingItem.id);
                    if (error) {
                        console.error("Error updating Livestock reference:", error);
                        alert(`Failed to update Livestock reference: ${error.message}`);
                        return;
                    }
                    setRefLivestock(prev => prev.map(i => i.id === editingItem.id ? { ...newData, id: editingItem.id } : i));
                } else {
                    const { data, error } = await supabase.from('ref_livestock').insert(refLivestockForm).select();
                    if (error) {
                        console.error("Error inserting Livestock reference:", error);
                        alert(`Failed to add Livestock reference: ${error.message}`);
                        return;
                    }
                    if (data && data.length > 0) {
                        setRefLivestock(prev => [data[0] as RefLivestock, ...prev]);
                    }
                }
            } else {
                if (editingItem) {
                    setRefLivestock(prev => prev.map(i => i.id === id ? newData : i));
                } else {
                    setRefLivestock(prev => [newData, ...prev]);
                }
            }
        } else if (activeTab === 'Equipment Reference') {
            const newData = { id, ...refEquipmentForm };
            if (supabase) {
                if (editingItem) {
                    const { error } = await supabase.from('ref_equipment').update(refEquipmentForm).eq('id', editingItem.id);
                    if (error) {
                        console.error("Error updating Equipment reference:", error);
                        alert(`Failed to update Equipment reference: ${error.message}`);
                        return;
                    }
                    setRefEquipment(prev => prev.map(i => i.id === editingItem.id ? { ...newData, id: editingItem.id } : i));
                } else {
                    const { data, error } = await supabase.from('ref_equipment').insert(refEquipmentForm).select();
                    if (error) {
                        console.error("Error inserting Equipment reference:", error);
                        alert(`Failed to add Equipment reference: ${error.message}`);
                        return;
                    }
                    if (data && data.length > 0) {
                        setRefEquipment(prev => [data[0] as RefEquipment, ...prev]);
                    }
                }
            } else {
                if (editingItem) {
                    setRefEquipment(prev => prev.map(i => i.id === id ? newData : i));
                } else {
                    setRefEquipment(prev => [newData, ...prev]);
                }
            }
        } else if (activeTab === 'Agricultural Input Reference') {
            const newData = { id, ...refInputForm };
            if (supabase) {
                if (editingItem) {
                    const { error } = await supabase.from('ref_inputs').update(refInputForm).eq('id', editingItem.id);
                    if (error) {
                        console.error("Error updating Input reference:", error);
                        alert(`Failed to update Input reference: ${error.message}`);
                        return;
                    }
                    setRefInputs(prev => prev.map(i => i.id === editingItem.id ? { ...newData, id: editingItem.id } : i));
                } else {
                    const { data, error } = await supabase.from('ref_inputs').insert(refInputForm).select();
                    if (error) {
                        console.error("Error inserting Input reference:", error);
                        alert(`Failed to add Input reference: ${error.message}`);
                        return;
                    }
                    if (data && data.length > 0) {
                        setRefInputs(prev => [data[0] as RefInput, ...prev]);
                    }
                }
            } else {
                if (editingItem) {
                    setRefInputs(prev => prev.map(i => i.id === id ? newData : i));
                } else {
                    setRefInputs(prev => [newData, ...prev]);
                }
            }
        } else if (activeTab === 'Infrastructure Reference') {
            const newData = { id, ...refInfrastructureForm };
            if (supabase) {
                if (editingItem) {
                    const { error } = await supabase.from('ref_infrastructure').update(refInfrastructureForm).eq('id', editingItem.id);
                    if (error) {
                        console.error("Error updating Infrastructure reference:", error);
                        alert(`Failed to update Infrastructure reference: ${error.message}`);
                        return;
                    }
                    setRefInfrastructure(prev => prev.map(i => i.id === editingItem.id ? { ...newData, id: editingItem.id } : i));
                } else {
                    const { data, error } = await supabase.from('ref_infrastructure').insert(refInfrastructureForm).select();
                    if (error) {
                        console.error("Error inserting Infrastructure reference:", error);
                        alert(`Failed to add Infrastructure reference: ${error.message}`);
                        return;
                    }
                    if (data && data.length > 0) {
                        setRefInfrastructure(prev => [data[0] as RefInfrastructure, ...prev]);
                    }
                }
            } else {
                if (editingItem) {
                    setRefInfrastructure(prev => prev.map(i => i.id === id ? newData : i));
                } else {
                    setRefInfrastructure(prev => [newData, ...prev]);
                }
            }
        } else if (activeTab === 'Training Reference') {
            const newData = { id, ...refTrainingForm };
            if (supabase) {
                if (editingItem) {
                    const { error } = await supabase.from('ref_trainings').update(refTrainingForm).eq('id', editingItem.id);
                    if (error) {
                        console.error("Error updating Training reference:", error);
                        alert(`Failed to update Training reference: ${error.message}`);
                        return;
                    }
                    setRefTrainings(prev => prev.map(i => i.id === editingItem.id ? { ...newData, id: editingItem.id } : i));
                } else {
                    const { data, error } = await supabase.from('ref_trainings').insert(refTrainingForm).select();
                    if (error) {
                        console.error("Error inserting Training reference:", error);
                        alert(`Failed to add Training reference: ${error.message}`);
                        return;
                    }
                    if (data && data.length > 0) {
                        setRefTrainings(prev => [data[0] as RefTrainingReference, ...prev]);
                    }
                }
            } else {
                if (editingItem) {
                    setRefTrainings(prev => prev.map(i => i.id === id ? newData : i));
                } else {
                    setRefTrainings(prev => [newData, ...prev]);
                }
            }
        } else if (activeTab === 'GIDA') {
            if (supabase) {
                if (editingItem) {
                    const { error } = await supabase.from('gida_areas').update(gidaForm).eq('id', editingItem.id);
                    if (error) {
                        console.error("Error updating GIDA area:", error);
                        alert(`Failed to update GIDA area: ${error.message}`);
                        return;
                    }
                    const newData = { id: editingItem.id, ...gidaForm };
                    setGidaList(prev => prev.map(i => i.id === editingItem.id ? newData : i));
                } else {
                    const { data, error } = await supabase.from('gida_areas').insert(gidaForm).select();
                    if (error) {
                        console.error("Error inserting GIDA area:", error);
                        alert(`Failed to add GIDA area: ${error.message}`);
                        return;
                    }
                    if (data && data.length > 0) {
                        setGidaList(prev => [data[0] as GidaArea, ...prev]);
                    }
                }
            } else {
                const newData = { id, ...gidaForm };
                if (editingItem) {
                    setGidaList(prev => prev.map(i => i.id === id ? newData : i));
                } else {
                    setGidaList(prev => [newData, ...prev]);
                }
            }
        } else {
            if (supabase) {
                if (editingItem) {
                    const { error } = await supabase.from('elcac_areas').update(elcacForm).eq('id', editingItem.id);
                    if (error) {
                        console.error("Error updating ELCAC area:", error);
                        alert(`Failed to update ELCAC area: ${error.message}`);
                        return;
                    }
                    const newData = { id: editingItem.id, ...elcacForm };
                    setElcacList(prev => prev.map(i => i.id === editingItem.id ? newData : i));
                } else {
                    const { data, error } = await supabase.from('elcac_areas').insert(elcacForm).select();
                    if (error) {
                        console.error("Error inserting ELCAC area:", error);
                        alert(`Failed to add ELCAC area: ${error.message}`);
                        return;
                    }
                    if (data && data.length > 0) {
                        setElcacList(prev => [data[0] as ElcacArea, ...prev]);
                    }
                }
            } else {
                const newData = { id, ...elcacForm };
                if (editingItem) {
                    setElcacList(prev => prev.map(i => i.id === id ? newData : i));
                } else {
                    setElcacList(prev => [newData, ...prev]);
                }
            }
        }
        setIsModalOpen(false);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteItem) return;
        if (activeTab === 'UACS') {
            setUacsList(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'Items') {
            setParticularList(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'Crop Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_commodities').delete().eq('id', deleteItem.id);
                if (error) {
                    console.error("Error deleting Crop reference:", error);
                    alert(`Failed to delete Crop reference: ${error.message}`);
                    return;
                }
            }
            setRefCommodities(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'Livestock Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_livestock').delete().eq('id', deleteItem.id);
                if (error) {
                    console.error("Error deleting Livestock reference:", error);
                    alert(`Failed to delete Livestock reference: ${error.message}`);
                    return;
                }
            }
            setRefLivestock(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'Equipment Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_equipment').delete().eq('id', deleteItem.id);
                if (error) {
                    console.error("Error deleting Equipment reference:", error);
                    alert(`Failed to delete Equipment reference: ${error.message}`);
                    return;
                }
            }
            setRefEquipment(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'Agricultural Input Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_inputs').delete().eq('id', deleteItem.id);
                if (error) {
                    console.error("Error deleting Input reference:", error);
                    alert(`Failed to delete Input reference: ${error.message}`);
                    return;
                }
            }
            setRefInputs(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'Infrastructure Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_infrastructure').delete().eq('id', deleteItem.id);
                if (error) {
                    console.error("Error deleting Infrastructure reference:", error);
                    alert(`Failed to delete Infrastructure reference: ${error.message}`);
                    return;
                }
            }
            setRefInfrastructure(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'Training Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_trainings').delete().eq('id', deleteItem.id);
                if (error) {
                    console.error("Error deleting Training reference:", error);
                    alert(`Failed to delete Training reference: ${error.message}`);
                    return;
                }
            }
            setRefTrainings(prev => prev.filter(i => i.id !== deleteItem.id));
        } else if (activeTab === 'GIDA') {
            if (supabase) {
                const { error } = await supabase.from('gida_areas').delete().eq('id', deleteItem.id);
                if (error) {
                    console.error("Error deleting GIDA area:", error);
                    alert(`Failed to delete GIDA area: ${error.message}`);
                    return;
                }
            }
            setGidaList(prev => prev.filter(i => i.id !== deleteItem.id));
        } else {
            if (supabase) {
                const { error } = await supabase.from('elcac_areas').delete().eq('id', deleteItem.id);
                if (error) {
                    console.error("Error deleting ELCAC area:", error);
                    alert(`Failed to delete ELCAC area: ${error.message}`);
                    return;
                }
            }
            setElcacList(prev => prev.filter(i => i.id !== deleteItem.id));
        }
        setDeleteItem(null);
    };

    // --- Multi-Delete Handlers ---
    const handleToggleSelectionMode = () => {
        if (isSelectionMode) {
            setIsSelectionMode(false);
            setSelectedIds([]);
        } else {
            setIsSelectionMode(true);
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const ids = paginatedData.map(i => i.id);
            setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
        } else {
            const idsToRemove = new Set(paginatedData.map(i => i.id));
            setSelectedIds(prev => prev.filter(id => !idsToRemove.has(id)));
        }
    };

    const handleSelectRow = (id: string) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(i => i !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const confirmMultiDelete = async () => {
        if (activeTab === 'UACS') {
            setUacsList(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'Items') {
            setParticularList(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'Crop Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_commodities').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting Crop references:", error);
                    alert(`Failed to delete Crop references: ${error.message}`);
                    return;
                }
            }
            setRefCommodities(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'Livestock Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_livestock').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting Livestock references:", error);
                    alert(`Failed to delete Livestock references: ${error.message}`);
                    return;
                }
            }
            setRefLivestock(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'Equipment Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_equipment').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting Equipment references:", error);
                    alert(`Failed to delete Equipment references: ${error.message}`);
                    return;
                }
            }
            setRefEquipment(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'Agricultural Input Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_inputs').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting Input references:", error);
                    alert(`Failed to delete Input references: ${error.message}`);
                    return;
                }
            }
            setRefInputs(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'Infrastructure Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_infrastructure').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting Infrastructure references:", error);
                    alert(`Failed to delete Infrastructure references: ${error.message}`);
                    return;
                }
            }
            setRefInfrastructure(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'Training Reference') {
            if (supabase) {
                const { error } = await supabase.from('ref_trainings').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting Training references:", error);
                    alert(`Failed to delete Training references: ${error.message}`);
                    return;
                }
            }
            setRefTrainings(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else if (activeTab === 'GIDA') {
            if (supabase) {
                const { error } = await supabase.from('gida_areas').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting GIDA areas:", error);
                    alert(`Failed to delete GIDA areas: ${error.message}`);
                    return;
                }
            }
            setGidaList(prev => prev.filter(i => !selectedIds.includes(i.id)));
        } else {
            if (supabase) {
                const { error } = await supabase.from('elcac_areas').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting ELCAC areas:", error);
                    alert(`Failed to delete ELCAC areas: ${error.message}`);
                    return;
                }
            }
            setElcacList(prev => prev.filter(i => !selectedIds.includes(i.id)));
        }
        setIsMultiDeleteModalOpen(false);
        setIsSelectionMode(false);
        setSelectedIds([]);
    };

    // --- Import / Export Handlers ---
    const handleDownloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        let ws;
        let filename;

        if (activeTab === 'UACS') {
            const headers = ['objectType', 'particular', 'uacsCode', 'description'];
            const example = [{
                objectType: 'MOOE',
                particular: 'Travelling Expenses',
                uacsCode: '50201010-00',
                description: 'Travelling Expenses - Local'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'UACS_Template.xlsx';
        } else if (activeTab === 'Items') {
            const headers = ['type', 'particular'];
            const example = [{
                type: 'Agricultural Inputs',
                particular: 'Carabao'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Items_Template.xlsx';
        } else if (activeTab === 'Crop Reference') {
            const headers = ['name', 'banner_program', 'commodity_group', 'min_elevation_masl', 'max_elevation_masl', 'max_slope_percent', 'wet_season_start', 'dry_season_start', 'recommended_soil', 'fertilizer_npk', 'watering_method', 'harvest_period_days', 'ph_min', 'ph_max', 'climate_type_suitability', 'target_yield_ha'];
            const example = [{
                name: 'Rice (Lowland)',
                banner_program: 'Rice',
                commodity_group: 'Cereal',
                min_elevation_masl: 0,
                max_elevation_masl: 500,
                max_slope_percent: 3,
                wet_season_start: 'June-July',
                dry_season_start: 'Jan-Feb',
                recommended_soil: 'Clay Loam / Alluvial',
                fertilizer_npk: '14-14-14 (Basal), 46-0-0 (Top-dress)',
                watering_method: 'Continuous Flooding / AWD',
                harvest_period_days: 120,
                ph_min: 5.5,
                ph_max: 7.0,
                climate_type_suitability: 'Type I, II, III, IV',
                target_yield_ha: 5.5
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Crop_Reference_Template.xlsx';
        } else if (activeTab === 'Livestock Reference') {
            const headers = ['name', 'category', 'breed_type', 'min_space_sqm_per_head', 'housing_type', 'min_temp_celsius', 'max_temp_celsius', 'gestation_incubation_days', 'maturity_days', 'productive_years', 'feed_type', 'target_fcr', 'water_liters_per_day', 'target_weight_kg', 'avg_eggs_per_year'];
            const example = [{
                name: 'Native Chicken (Darag)',
                category: 'Poultry',
                breed_type: 'Native',
                min_space_sqm_per_head: 0.15,
                housing_type: 'Free-range / Elevated',
                min_temp_celsius: 24,
                max_temp_celsius: 32,
                gestation_incubation_days: 21,
                maturity_days: 120,
                productive_years: 2,
                feed_type: 'Mixed Grains / Forage',
                target_fcr: 3.5,
                water_liters_per_day: 0.2,
                target_weight_kg: 1.2,
                avg_eggs_per_year: 80
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Livestock_Reference_Template.xlsx';
        } else if (activeTab === 'Equipment Reference') {
            const headers = ['name', 'category', 'equipment_type', 'power_source', 'capacity_rating', 'fuel_consumption_rate', 'estimated_useful_life_years', 'unit_cost_estimate', 'maintenance_interval_months', 'required_operators', 'safety_gear_required'];
            const example = [{
                name: 'Hand Tractor',
                category: 'Land Preparation',
                equipment_type: 'Power Machinery',
                power_source: '7hp Diesel',
                capacity_rating: '0.5 hectare/day',
                fuel_consumption_rate: 1.5,
                estimated_useful_life_years: 10,
                unit_cost_estimate: 120000,
                maintenance_interval_months: 6,
                required_operators: 1,
                safety_gear_required: 'Rubber Boots, Heavy Duty Gloves'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Equipment_Reference_Template.xlsx';
        } else if (activeTab === 'Agricultural Input Reference') {
            const headers = ['input_type', 'sub_type', 'name', 'standard_uom', 'avg_price_2026', 'fpa_registration_no', 'shelf_life_months', 'application_rate_per_ha', 'hazchem_rating'];
            const example = [{
                input_type: 'Fertilizer',
                sub_type: 'Inorganic',
                name: 'Complete (14-14-14)',
                standard_uom: '50kg bag',
                avg_price_2026: 2500,
                fpa_registration_no: 'FPA-789-012',
                shelf_life_months: 24,
                application_rate_per_ha: 6,
                hazchem_rating: 'Category IV - Blue'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Agricultural_Input_Reference_Template.xlsx';
        } else if (activeTab === 'Infrastructure Reference') {
            const headers = ['name', 'category', 'structure_type', 'capacity_rating', 'estimated_useful_life_years', 'unit_cost_estimate', 'maintenance_interval_months', 'required_permits'];
            const example = [{
                name: 'Communal Irrigation System',
                category: 'Irrigation',
                structure_type: 'Concrete Lined',
                capacity_rating: '500 hectares',
                estimated_useful_life_years: 25,
                unit_cost_estimate: 15000,
                maintenance_interval_months: 12,
                required_permits: 'ECC, Water Permit'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Infrastructure_Reference_Template.xlsx';
        } else if (activeTab === 'Training Reference') {
            const headers = ['title', 'category', 'standard_duration_days', 'delivery_mode', 'target_audience', 'accrediting_body', 'minimum_participants', 'required_facilities', 'key_modules', 'expected_competency', 'certification_type'];
            const example = [{
                title: 'Organic Fertilizer Production',
                category: 'Crops',
                standard_duration_days: 3,
                delivery_mode: 'Face-to-Face',
                target_audience: 'Farmer Leaders',
                accrediting_body: 'DA-ATI',
                minimum_participants: 15,
                required_facilities: 'Demo Farm, Training Room',
                key_modules: 'Module 1: Intro, Module 2: Composting',
                expected_competency: 'Ability to produce organic fertilizer',
                certification_type: 'Certificate of Completion'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'Training_Reference_Template.xlsx';
        } else if (activeTab === 'GIDA') {
            const headers = ['region', 'province', 'municipality', 'barangay'];
            const example = [{
                region: 'Region I',
                province: 'Ilocos Norte',
                municipality: 'Adams',
                barangay: 'Adams (Pob.)'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'GIDA_Areas_Template.xlsx';
        } else {
            const headers = ['region', 'province', 'municipality', 'barangay'];
            const example = [{
                region: 'Region I',
                province: 'Ilocos Norte',
                municipality: 'Adams',
                barangay: 'Adams (Pob.)'
            }];
            ws = XLSX.utils.json_to_sheet(example, { header: headers });
            filename = 'ELCAC_Areas_Template.xlsx';
        }

        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, filename);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

                if (activeTab === 'UACS') {
                    const newItems: ReferenceUacs[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        objectType: row.objectType || 'MOOE',
                        particular: row.particular || '',
                        uacsCode: row.uacsCode ? String(row.uacsCode) : '',
                        description: row.description || ''
                    })).filter(i => i.uacsCode && i.particular);

                    if (supabase) {
                        const { error } = await supabase.from('reference_uacs').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            // Update local state to reflect changes without full reload
                            setUacsList(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} UACS codes uploaded successfully to database.`);
                        }
                    } else {
                        setUacsList(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} UACS codes imported locally.`);
                    }
                } else if (activeTab === 'Items') {
                    const newItems: ReferenceParticular[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        type: row.type || 'Others',
                        particular: row.particular || ''
                    })).filter(i => i.particular);

                    if (supabase) {
                        const { error } = await supabase.from('reference_particulars').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            setParticularList(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} items uploaded successfully to database.`);
                        }
                    } else {
                        setParticularList(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} items imported locally.`);
                    }
                } else if (activeTab === 'Crop Reference') {
                    const newItems: RefCommodity[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        name: row.name || '',
                        banner_program: row.banner_program || '',
                        commodity_group: row.commodity_group || '',
                        min_elevation_masl: Number(row.min_elevation_masl) || 0,
                        max_elevation_masl: Number(row.max_elevation_masl) || 0,
                        max_slope_percent: Number(row.max_slope_percent) || 0,
                        wet_season_start: row.wet_season_start || '',
                        dry_season_start: row.dry_season_start || '',
                        recommended_soil: row.recommended_soil || '',
                        fertilizer_npk: row.fertilizer_npk || '',
                        watering_method: row.watering_method || '',
                        harvest_period_days: Number(row.harvest_period_days) || 0,
                        ph_min: Number(row.ph_min) || 0,
                        ph_max: Number(row.ph_max) || 0,
                        climate_type_suitability: row.climate_type_suitability || '',
                        target_yield_ha: Number(row.target_yield_ha) || 0
                    })).filter(i => i.name);

                    if (supabase) {
                        const { error } = await supabase.from('ref_commodities').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            setRefCommodities(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} crop references uploaded successfully to database.`);
                        }
                    } else {
                        setRefCommodities(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} crop references imported locally.`);
                    }
                } else if (activeTab === 'Livestock Reference') {
                    const newItems: RefLivestock[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        name: row.name || '',
                        category: row.category || 'Poultry',
                        breed_type: row.breed_type || '',
                        min_space_sqm_per_head: Number(row.min_space_sqm_per_head) || 0,
                        housing_type: row.housing_type || '',
                        min_temp_celsius: Number(row.min_temp_celsius) || 0,
                        max_temp_celsius: Number(row.max_temp_celsius) || 0,
                        gestation_incubation_days: Number(row.gestation_incubation_days) || 0,
                        maturity_days: Number(row.maturity_days) || 0,
                        productive_years: Number(row.productive_years) || 0,
                        feed_type: row.feed_type || '',
                        target_fcr: Number(row.target_fcr) || 0,
                        water_liters_per_day: Number(row.water_liters_per_day) || 0,
                        target_weight_kg: Number(row.target_weight_kg) || 0,
                        avg_eggs_per_year: Number(row.avg_eggs_per_year) || 0
                    })).filter(i => i.name);

                    if (supabase) {
                        const { error } = await supabase.from('ref_livestock').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            setRefLivestock(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} livestock references uploaded successfully to database.`);
                        }
                    } else {
                        setRefLivestock(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} livestock references imported locally.`);
                    }
                } else if (activeTab === 'Equipment Reference') {
                    const newItems: RefEquipment[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        name: row.name || '',
                        category: row.category || '',
                        equipment_type: row.equipment_type || '',
                        power_source: row.power_source || '',
                        capacity_rating: row.capacity_rating || '',
                        fuel_consumption_rate: Number(row.fuel_consumption_rate) || 0,
                        estimated_useful_life_years: Number(row.estimated_useful_life_years) || 0,
                        unit_cost_estimate: Number(row.unit_cost_estimate) || 0,
                        maintenance_interval_months: Number(row.maintenance_interval_months) || 0,
                        required_operators: Number(row.required_operators) || 1,
                        safety_gear_required: row.safety_gear_required || ''
                    })).filter(i => i.name);

                    if (supabase) {
                        const { error } = await supabase.from('ref_equipment').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            setRefEquipment(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} equipment references uploaded successfully to database.`);
                        }
                    } else {
                        setRefEquipment(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} equipment references imported locally.`);
                    }
                } else if (activeTab === 'Agricultural Input Reference') {
                    const newItems: RefInput[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        input_type: row.input_type || '',
                        sub_type: row.sub_type || '',
                        name: row.name || '',
                        standard_uom: row.standard_uom || '',
                        avg_price_2026: Number(row.avg_price_2026) || 0,
                        fpa_registration_no: row.fpa_registration_no || '',
                        shelf_life_months: Number(row.shelf_life_months) || 0,
                        application_rate_per_ha: Number(row.application_rate_per_ha) || 0,
                        hazchem_rating: row.hazchem_rating || ''
                    })).filter(i => i.name);

                    if (supabase) {
                        const { error } = await supabase.from('ref_inputs').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            setRefInputs(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} input references uploaded successfully to database.`);
                        }
                    } else {
                        setRefInputs(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} input references imported locally.`);
                    }
                } else if (activeTab === 'Infrastructure Reference') {
                    const newItems: RefInfrastructure[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        name: row.name || '',
                        category: row.category || '',
                        structure_type: row.structure_type || '',
                        capacity_rating: row.capacity_rating || '',
                        estimated_useful_life_years: Number(row.estimated_useful_life_years) || 10,
                        unit_cost_estimate: Number(row.unit_cost_estimate) || 0,
                        maintenance_interval_months: Number(row.maintenance_interval_months) || 12,
                        required_permits: row.required_permits || ''
                    })).filter(i => i.name);

                    if (supabase) {
                        const { error } = await supabase.from('ref_infrastructure').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            setRefInfrastructure(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} infrastructure references uploaded successfully to database.`);
                        }
                    } else {
                        setRefInfrastructure(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} infrastructure references imported locally.`);
                    }
                } else if (activeTab === 'Training Reference') {
                    const newItems: RefTrainingReference[] = jsonData.map((row: any) => ({
                        id: crypto.randomUUID(),
                        title: row.title || '',
                        category: row.category || '',
                        standard_duration_days: Number(row.standard_duration_days) || 3,
                        delivery_mode: row.delivery_mode || 'Face-to-Face',
                        target_audience: row.target_audience || '',
                        accrediting_body: row.accrediting_body || 'DA-ATI',
                        minimum_participants: Number(row.minimum_participants) || 15,
                        required_facilities: row.required_facilities || '',
                        key_modules: row.key_modules || '',
                        expected_competency: row.expected_competency || '',
                        certification_type: row.certification_type || ''
                    })).filter(i => i.title);

                    if (supabase) {
                        const { error } = await supabase.from('ref_trainings').insert(newItems);
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            setRefTrainings(prev => [...newItems, ...prev]);
                            alert(`${newItems.length} training references uploaded successfully to database.`);
                        }
                    } else {
                        setRefTrainings(prev => [...newItems, ...prev]);
                        alert(`${newItems.length} training references imported locally.`);
                    }
                } else if (activeTab === 'GIDA') {
                    const newItems = jsonData.map((row: any) => ({
                        region: normalizeRegionName(row.region || ''),
                        province: row.province || '',
                        municipality: row.municipality || '',
                        barangay: row.barangay || ''
                    })).filter(i => i.region && i.province && i.municipality && i.barangay);

                    if (supabase) {
                        const { data, error } = await supabase.from('gida_areas').insert(newItems).select();
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            if (data) {
                                setGidaList(prev => [...(data as GidaArea[]), ...prev]);
                            }
                            alert(`${newItems.length} GIDA areas uploaded successfully to database.`);
                        }
                    } else {
                        const localItems = newItems.map(item => ({...item, id: crypto.randomUUID()}));
                        setGidaList(prev => [...localItems, ...prev]);
                        alert(`${newItems.length} GIDA areas imported locally.`);
                    }
                } else {
                    const newItems = jsonData.map((row: any) => ({
                        region: normalizeRegionName(row.region || ''),
                        province: row.province || '',
                        municipality: row.municipality || '',
                        barangay: row.barangay || ''
                    })).filter(i => i.region && i.province && i.municipality && i.barangay);

                    if (supabase) {
                        const { data, error } = await supabase.from('elcac_areas').insert(newItems).select();
                        if (error) {
                            console.error("Batch insert error:", error);
                            alert(`Failed to upload to Supabase: ${error.message}`);
                        } else {
                            if (data) {
                                setElcacList(prev => [...(data as ElcacArea[]), ...prev]);
                            }
                            alert(`${newItems.length} ELCAC areas uploaded successfully to database.`);
                        }
                    } else {
                        const localItems = newItems.map(item => ({...item, id: crypto.randomUUID()}));
                        setElcacList(prev => [...localItems, ...prev]);
                        alert(`${newItems.length} ELCAC areas imported locally.`);
                    }
                }
            } catch (error: any) {
                console.error("Error processing XLSX file:", error);
                alert(`Failed to import file. ${error.message}`);
            } finally {
                setIsUploading(false);
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm";

    return (
        <div className="space-y-6">
            {/* Multi Delete Modal */}
            {isMultiDeleteModalOpen && canEdit && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold text-red-600 dark:text-red-400">Confirm Bulk Deletion</h3>
                        <p className="my-4 text-gray-700 dark:text-gray-300">
                            Are you sure you want to delete the <strong>{selectedIds.length}</strong> selected item(s)? 
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmMultiDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete All Selected</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header with Title */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">System References</h2>
            </div>

            {/* Tab Groups */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
                <nav className="-mb-px flex space-x-8">
                    {['DCF Reference', 'Commodity References', 'Intervention References', 'Policy References'].map((group) => (
                        <button
                            key={group}
                            onClick={() => {
                                setActiveGroup(group as any);
                                // Set default tab for group
                                if (group === 'DCF Reference') setActiveTab('UACS');
                                else if (group === 'Commodity References') setActiveTab('Crop Reference');
                                else if (group === 'Intervention References') setActiveTab('Agricultural Input Reference');
                                else if (group === 'Policy References') setActiveTab('GIDA');
                                setSearchTerm('');
                            }}
                            className={`whitespace-nowrap py-2 px-6 rounded-md font-medium text-sm transition-colors ${
                                activeGroup === group
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                        >
                            {group}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Sub-Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                <nav className="-mb-px flex space-x-6">
                    {activeGroup === 'DCF Reference' && (
                        <>
                            <button onClick={() => { setActiveTab('UACS'); setSearchTerm(''); }} className={`py-2 px-1 border-b-2 font-medium text-xs ${activeTab === 'UACS' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>UACS Codes</button>
                            <button onClick={() => { setActiveTab('Items'); setSearchTerm(''); }} className={`py-2 px-1 border-b-2 font-medium text-xs ${activeTab === 'Items' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>Subproject Items</button>
                        </>
                    )}
                    {activeGroup === 'Commodity References' && (
                        <>
                            <button onClick={() => { setActiveTab('Crop Reference'); setSearchTerm(''); }} className={`py-2 px-1 border-b-2 font-medium text-xs ${activeTab === 'Crop Reference' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>Crop</button>
                            <button onClick={() => { setActiveTab('Livestock Reference'); setSearchTerm(''); }} className={`py-2 px-1 border-b-2 font-medium text-xs ${activeTab === 'Livestock Reference' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>Livestock</button>
                        </>
                    )}
                    {activeGroup === 'Intervention References' && (
                        <>
                            <button onClick={() => { setActiveTab('Agricultural Input Reference'); setSearchTerm(''); }} className={`py-2 px-1 border-b-2 font-medium text-xs ${activeTab === 'Agricultural Input Reference' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>Agricultural Input Reference</button>
                            <button onClick={() => { setActiveTab('Equipment Reference'); setSearchTerm(''); }} className={`py-2 px-1 border-b-2 font-medium text-xs ${activeTab === 'Equipment Reference' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>Equipment Reference</button>
                            <button onClick={() => { setActiveTab('Infrastructure Reference'); setSearchTerm(''); }} className={`py-2 px-1 border-b-2 font-medium text-xs ${activeTab === 'Infrastructure Reference' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>Infrastructure Reference</button>
                            <button onClick={() => { setActiveTab('Training Reference'); setSearchTerm(''); }} className={`py-2 px-1 border-b-2 font-medium text-xs ${activeTab === 'Training Reference' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>Training Reference</button>
                        </>
                    )}
                    {activeGroup === 'Policy References' && (
                        <>
                            <button onClick={() => { setActiveTab('GIDA'); setSearchTerm(''); }} className={`py-2 px-1 border-b-2 font-medium text-xs ${activeTab === 'GIDA' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>GIDA Areas</button>
                            <button onClick={() => { setActiveTab('ELCAC'); setSearchTerm(''); }} className={`py-2 px-1 border-b-2 font-medium text-xs ${activeTab === 'ELCAC' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>ELCAC Areas</button>
                        </>
                    )}
                </nav>
            </div>

            {/* Search and Bulk Actions Row */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="w-full md:w-1/3">
                    <input 
                        type="text" 
                        placeholder="Search..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
                
                {canEdit && (
                    <div className="flex flex-wrap gap-2 items-center">
                        {isSelectionMode && selectedIds.length > 0 && (
                            <button onClick={() => setIsMultiDeleteModalOpen(true)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700">
                                Delete Selected ({selectedIds.length})
                            </button>
                        )}
                        <button 
                            onClick={handleOpenAdd}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-sm text-sm font-medium transition-colors"
                        >
                            + Add New {activeTab === 'UACS' ? 'UACS Code' : activeTab === 'Items' ? 'Item' : activeTab === 'Crop Reference' ? 'Crop Reference' : activeTab === 'Livestock Reference' ? 'Livestock Reference' : activeTab === 'Equipment Reference' ? 'Equipment Reference' : activeTab === 'Agricultural Input Reference' ? 'Agricultural Input Reference' : activeTab === 'Infrastructure Reference' ? 'Infrastructure Reference' : activeTab === 'Training Reference' ? 'Training Reference' : activeTab === 'GIDA' ? 'GIDA Area' : 'ELCAC Area'}
                        </button>
                        <button 
                            onClick={handleDownloadTemplate}
                            className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md shadow-sm text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                            Download Template
                        </button>
                        <label 
                            htmlFor="ref-upload" 
                            className={`inline-flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-md shadow-sm text-sm font-medium hover:bg-emerald-700 ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                            {isUploading ? 'Uploading...' : 'Upload XLSX'}
                        </label>
                        <input 
                            id="ref-upload" 
                            type="file" 
                            className="hidden" 
                            onChange={handleFileUpload} 
                            accept=".xlsx, .xls"
                            disabled={isUploading}
                        />
                        {activeTab === 'GIDA' && (
                            <button 
                                onClick={handleRetroactiveGidaUpdate}
                                disabled={isUploading}
                                className={`px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-sm text-sm font-medium ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title="Check all IPOs and update GIDA status"
                            >
                                Retroactive Update
                            </button>
                        )}
                        {activeTab === 'ELCAC' && (
                            <button 
                                onClick={handleRetroactiveElcacUpdate}
                                disabled={isUploading}
                                className={`px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-sm text-sm font-medium ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title="Check all IPOs and update ELCAC status"
                            >
                                Retroactive Update
                            </button>
                        )}
                        <button
                            onClick={handleToggleSelectionMode}
                            className={`inline-flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 shadow-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 ${isSelectionMode ? 'bg-gray-200 dark:bg-gray-600 text-red-600' : 'bg-white dark:bg-gray-700 text-gray-500'}`}
                            title="Toggle Multi-Delete Mode"
                        >
                            <TrashIcon />
                        </button>
                    </div>
                )}
            </div>

            {/* Table Area */}
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                {activeTab === 'UACS' ? (
                                    <>
                                        <SortableHeader label="Object Type" sortKey="objectType" />
                                        <SortableHeader label="Particular" sortKey="particular" />
                                        <SortableHeader label="UACS Code" sortKey="uacsCode" />
                                        <SortableHeader label="Description" sortKey="description" />
                                    </>
                                ) : activeTab === 'Items' ? (
                                    <>
                                        <SortableHeader label="Item Type" sortKey="type" />
                                        <SortableHeader label="Item Particular" sortKey="particular" />
                                    </>
                                ) : activeTab === 'Crop Reference' ? (
                                    <>
                                        <th className="px-6 py-3 w-10"></th>
                                        <SortableHeader label="Name" sortKey="name" tooltip={CROP_TOOLTIPS.name} />
                                        <SortableHeader label="Banner" sortKey="banner_program" tooltip={CROP_TOOLTIPS.banner_program} />
                                        <SortableHeader label="Group" sortKey="commodity_group" tooltip={CROP_TOOLTIPS.commodity_group} />
                                    </>
                                ) : activeTab === 'Livestock Reference' ? (
                                    <>
                                        <th className="px-6 py-3 w-10"></th>
                                        <SortableHeader label="Name" sortKey="name" tooltip={LIVESTOCK_TOOLTIPS.name} />
                                        <SortableHeader label="Category" sortKey="category" tooltip={LIVESTOCK_TOOLTIPS.category} />
                                        <SortableHeader label="Breed Type" sortKey="breed_type" tooltip={LIVESTOCK_TOOLTIPS.breed_type} />
                                    </>
                                ) : activeTab === 'Equipment Reference' ? (
                                    <>
                                        <th className="px-6 py-3 w-10"></th>
                                        <SortableHeader label="Name" sortKey="name" tooltip={EQUIPMENT_TOOLTIPS.name} />
                                        <SortableHeader label="Category" sortKey="category" tooltip={EQUIPMENT_TOOLTIPS.category} />
                                        <SortableHeader label="Equipment Type" sortKey="equipment_type" tooltip={EQUIPMENT_TOOLTIPS.equipment_type} />
                                    </>
                                ) : activeTab === 'Agricultural Input Reference' ? (
                                    <>
                                        <th className="px-6 py-3 w-10"></th>
                                        <SortableHeader label="Name" sortKey="name" tooltip={INPUT_TOOLTIPS.name} />
                                        <SortableHeader label="Type" sortKey="input_type" tooltip={INPUT_TOOLTIPS.input_type} />
                                        <SortableHeader label="Sub-Type" sortKey="sub_type" tooltip={INPUT_TOOLTIPS.sub_type} />
                                    </>
                                ) : activeTab === 'Infrastructure Reference' ? (
                                    <>
                                        <th className="px-6 py-3 w-10"></th>
                                        <SortableHeader label="Name" sortKey="name" tooltip={INFRASTRUCTURE_TOOLTIPS.name} />
                                        <SortableHeader label="Category" sortKey="category" tooltip={INFRASTRUCTURE_TOOLTIPS.category} />
                                        <SortableHeader label="Structure Type" sortKey="structure_type" tooltip={INFRASTRUCTURE_TOOLTIPS.structure_type} />
                                    </>
                                ) : activeTab === 'Training Reference' ? (
                                    <>
                                        <th className="px-6 py-3 w-10"></th>
                                        <SortableHeader label="Title" sortKey="title" tooltip={TRAINING_TOOLTIPS.title} />
                                        <SortableHeader label="Category" sortKey="category" tooltip={TRAINING_TOOLTIPS.category} />
                                    </>
                                ) : (
                                    <>
                                        <SortableHeader label="Region" sortKey="region" />
                                        <SortableHeader label="Province" sortKey="province" />
                                        <SortableHeader label="Municipality" sortKey="municipality" />
                                        <SortableHeader label="Barangay" sortKey="barangay" />
                                    </>
                                )}
                                {canEdit && (
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        {isSelectionMode ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <span className="text-xs">Select All</span>
                                                <input 
                                                    type="checkbox" 
                                                    onChange={handleSelectAll} 
                                                    checked={paginatedData.length > 0 && paginatedData.every((i: any) => selectedIds.includes(i.id))}
                                                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                />
                                            </div>
                                        ) : (
                                            "Actions"
                                        )}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedData.length > 0 ? (
                                paginatedData.map((item: any) => (
                                    <React.Fragment key={item.id}>
                                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            {activeTab === 'UACS' ? (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.objectType}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.particular}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-300">{item.uacsCode}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">{item.description}</td>
                                                </>
                                            ) : activeTab === 'Items' ? (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.type}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.particular}</td>
                                                </>
                                            ) : activeTab === 'Crop Reference' ? (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setExpandedRowId(expandedRowId === item.id ? null : item.id); }}
                                                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                                                        >
                                                            {expandedRowId === item.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.banner_program}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.commodity_group}</td>
                                                </>
                                            ) : activeTab === 'Livestock Reference' ? (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <button 
                                                            onClick={() => setExpandedRowId(expandedRowId === item.id ? null : item.id)}
                                                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full transition-colors"
                                                        >
                                                            {expandedRowId === item.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.category}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.breed_type}</td>
                                                </>
                                            ) : activeTab === 'Equipment Reference' ? (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <button 
                                                            onClick={() => setExpandedRowId(expandedRowId === item.id ? null : item.id)}
                                                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full transition-colors"
                                                        >
                                                            {expandedRowId === item.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.category}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.equipment_type}</td>
                                                </>
                                            ) : activeTab === 'Agricultural Input Reference' ? (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <button 
                                                            onClick={() => setExpandedRowId(expandedRowId === item.id ? null : item.id)}
                                                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full transition-colors"
                                                        >
                                                            {expandedRowId === item.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.input_type}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.sub_type}</td>
                                                </>
                                            ) : activeTab === 'Infrastructure Reference' ? (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <button 
                                                            onClick={() => setExpandedRowId(expandedRowId === item.id ? null : item.id)}
                                                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full transition-colors"
                                                        >
                                                            {expandedRowId === item.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.category}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.structure_type}</td>
                                                </>
                                            ) : activeTab === 'Training Reference' ? (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <button 
                                                            onClick={() => setExpandedRowId(expandedRowId === item.id ? null : item.id)}
                                                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full transition-colors"
                                                        >
                                                            {expandedRowId === item.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.title}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.category}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.region}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.province}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.municipality}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.barangay}</td>
                                                </>
                                            )}
                                            {canEdit && (
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    {isSelectionMode ? (
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedIds.includes(item.id)} 
                                                            onChange={(e) => { e.stopPropagation(); handleSelectRow(item.id); }} 
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="mr-3 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                        />
                                                    ) : (
                                                        <>
                                                            <button onClick={() => handleOpenEdit(item)} className="text-emerald-600 hover:text-emerald-900 mr-3">Edit</button>
                                                            <button onClick={() => setDeleteItem(item)} className="text-red-600 hover:text-red-900">Delete</button>
                                                        </>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                        {expandedRowId === item.id && activeTab === 'Crop Reference' && (
                                            <tr className="bg-emerald-50/30 dark:bg-emerald-900/10">
                                                <td colSpan={canEdit ? 5 : 4} className="px-6 py-4">
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1" title={CROP_TOOLTIPS.min_elevation_masl + " " + CROP_TOOLTIPS.max_elevation_masl}>
                                                                Elevation Range <Info className="h-3 w-3" />
                                                            </p>
                                                            <p className="text-gray-900 dark:text-white">{item.min_elevation_masl} - {item.max_elevation_masl} masl</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1" title={CROP_TOOLTIPS.max_slope_percent}>
                                                                Max Slope <Info className="h-3 w-3" />
                                                            </p>
                                                            <p className="text-gray-900 dark:text-white">{item.max_slope_percent}%</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1" title={CROP_TOOLTIPS.wet_season_start + " " + CROP_TOOLTIPS.dry_season_start}>
                                                                Seasonality <Info className="h-3 w-3" />
                                                            </p>
                                                            <p className="text-gray-900 dark:text-white">Wet: {item.wet_season_start} | Dry: {item.dry_season_start}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1" title={CROP_TOOLTIPS.recommended_soil}>
                                                                Soil Type <Info className="h-3 w-3" />
                                                            </p>
                                                            <p className="text-gray-900 dark:text-white">{item.recommended_soil}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1" title={CROP_TOOLTIPS.fertilizer_npk}>
                                                                Fertilizer (NPK) <Info className="h-3 w-3" />
                                                            </p>
                                                            <p className="text-gray-900 dark:text-white">{item.fertilizer_npk}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1" title={CROP_TOOLTIPS.watering_method}>
                                                                Watering <Info className="h-3 w-3" />
                                                            </p>
                                                            <p className="text-gray-900 dark:text-white">{item.watering_method}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1" title={CROP_TOOLTIPS.harvest_period_days}>
                                                                Harvest Period <Info className="h-3 w-3" />
                                                            </p>
                                                            <p className="text-gray-900 dark:text-white">{item.harvest_period_days} days</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1" title={CROP_TOOLTIPS.ph_min + " " + CROP_TOOLTIPS.ph_max}>
                                                                pH Range <Info className="h-3 w-3" />
                                                            </p>
                                                            <p className="text-gray-900 dark:text-white">{item.ph_min} - {item.ph_max}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1" title={CROP_TOOLTIPS.climate_type_suitability}>
                                                                Climate Suitability <Info className="h-3 w-3" />
                                                            </p>
                                                            <p className="text-gray-900 dark:text-white">{item.climate_type_suitability}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1" title={CROP_TOOLTIPS.target_yield_ha}>
                                                                Target Yield <Info className="h-3 w-3" />
                                                            </p>
                                                            <p className="text-gray-900 dark:text-white">{item.target_yield_ha} t/ha</p>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        {expandedRowId === item.id && activeTab === 'Livestock Reference' && (
                                            <tr className="bg-gray-50 dark:bg-gray-800/50">
                                                <td colSpan={canEdit ? 5 : 4} className="px-6 py-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Housing & Space</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Space Requirement (sqm): <span className="text-gray-900 dark:text-white font-medium">{item.min_space_sqm_per_head} sqm/head</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Housing System: <span className="text-gray-900 dark:text-white font-medium">{item.housing_type}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Temp Range: <span className="text-gray-900 dark:text-white font-medium">{item.min_temp_celsius}°C - {item.max_temp_celsius}°C</span></p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Growth & Production</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Gestation/Incubation: <span className="text-gray-900 dark:text-white font-medium">{item.gestation_incubation_days} days</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Market Maturity: <span className="text-gray-900 dark:text-white font-medium">{item.maturity_days} days</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Economic Lifespan: <span className="text-gray-900 dark:text-white font-medium">{item.productive_years} years</span></p>
                                                                {item.category === 'Poultry' && (
                                                                    <p className="text-xs text-gray-500 dark:text-gray-400">Annual Egg Yield: <span className="text-gray-900 dark:text-white font-medium">{item.avg_eggs_per_year}</span></p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Nutrition & Weight</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Feeding Protocol: <span className="text-gray-900 dark:text-white font-medium">{item.feed_type}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Target FCR: <span className="text-gray-900 dark:text-white font-medium">{item.target_fcr}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Market Weight (kg): <span className="text-gray-900 dark:text-white font-medium">{item.target_weight_kg} kg</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Daily Water (L): <span className="text-gray-900 dark:text-white font-medium">{item.water_liters_per_day} L</span></p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        {expandedRowId === item.id && activeTab === 'Equipment Reference' && (
                                            <tr className="bg-gray-50 dark:bg-gray-800/50">
                                                <td colSpan={canEdit ? 5 : 4} className="px-6 py-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Technical Specs</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Power Source: <span className="text-gray-900 dark:text-white font-medium">{item.power_source}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Capacity Rating: <span className="text-gray-900 dark:text-white font-medium">{item.capacity_rating}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Fuel Consumption: <span className="text-gray-900 dark:text-white font-medium">{item.fuel_consumption_rate} L/hr</span></p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Lifecycle & Cost</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Useful Life: <span className="text-gray-900 dark:text-white font-medium">{item.estimated_useful_life_years} years</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Unit Cost Est.: <span className="text-gray-900 dark:text-white font-medium">₱{item.unit_cost_estimate?.toLocaleString()}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Maint. Interval: <span className="text-gray-900 dark:text-white font-medium">{item.maintenance_interval_months} months</span></p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Operations</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Required Operators: <span className="text-gray-900 dark:text-white font-medium">{item.required_operators}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Safety Gear: <span className="text-gray-900 dark:text-white font-medium">{item.safety_gear_required}</span></p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        {expandedRowId === item.id && activeTab === 'Agricultural Input Reference' && (
                                            <tr className="bg-gray-50 dark:bg-gray-800/50">
                                                <td colSpan={canEdit ? 5 : 4} className="px-6 py-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Technical Specs</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Standard Unit: <span className="text-gray-900 dark:text-white font-medium">{item.standard_uom}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Shelf Life: <span className="text-gray-900 dark:text-white font-medium">{item.shelf_life_months} months</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Application Rate: <span className="text-gray-900 dark:text-white font-medium">{item.application_rate_per_ha} per ha</span></p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Regulatory & Cost</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Avg. Price (2026): <span className="text-gray-900 dark:text-white font-medium">₱{item.avg_price_2026?.toLocaleString()}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">FPA Reg No.: <span className="text-gray-900 dark:text-white font-medium">{item.fpa_registration_no}</span></p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Safety</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Hazchem Rating: <span className="text-gray-900 dark:text-white font-medium">{item.hazchem_rating}</span></p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        {expandedRowId === item.id && activeTab === 'Infrastructure Reference' && (
                                            <tr className="bg-gray-50 dark:bg-gray-800/50">
                                                <td colSpan={canEdit ? 5 : 4} className="px-6 py-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Technical Specs</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Capacity Rating: <span className="text-gray-900 dark:text-white font-medium">{item.capacity_rating}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Estimated Useful Life: <span className="text-gray-900 dark:text-white font-medium">{item.estimated_useful_life_years} years</span></p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Lifecycle & Cost</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Unit Cost Estimate: <span className="text-gray-900 dark:text-white font-medium">₱{item.unit_cost_estimate?.toLocaleString()}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Maint. Interval: <span className="text-gray-900 dark:text-white font-medium">{item.maintenance_interval_months} months</span></p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Compliance</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Required Permits: <span className="text-gray-900 dark:text-white font-medium">{item.required_permits}</span></p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {expandedRowId === item.id && activeTab === 'Training Reference' && (
                                                <tr className="bg-gray-50 dark:bg-gray-800/50">
                                                    <td colSpan={canEdit ? 5 : 3} className="px-6 py-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Training Details</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Duration: <span className="text-gray-900 dark:text-white font-medium">{item.standard_duration_days} days</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Delivery Mode: <span className="text-gray-900 dark:text-white font-medium">{item.delivery_mode}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Accrediting Body: <span className="text-gray-900 dark:text-white font-medium">{item.accrediting_body}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Certification: <span className="text-gray-900 dark:text-white font-medium">{item.certification_type}</span></p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Target & Capacity</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Target Audience: <span className="text-gray-900 dark:text-white font-medium">{item.target_audience}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Min Participants: <span className="text-gray-900 dark:text-white font-medium">{item.minimum_participants}</span></p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Requirements & Content</h4>
                                                            <div className="space-y-1">
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Facilities: <span className="text-gray-900 dark:text-white font-medium">{item.required_facilities}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Key Modules: <span className="text-gray-900 dark:text-white font-medium">{item.key_modules}</span></p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">Competency: <span className="text-gray-900 dark:text-white font-medium">{item.expected_competency}</span></p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            ) : (
                                <tr><td colSpan={canEdit ? (['UACS', 'GIDA', 'ELCAC', 'Crop Reference', 'Livestock Reference', 'Equipment Reference', 'Agricultural Input Reference', 'Infrastructure Reference', 'Training Reference'].includes(activeTab) ? 5 : 3) : (['UACS', 'GIDA', 'ELCAC', 'Crop Reference', 'Livestock Reference', 'Equipment Reference', 'Agricultural Input Reference', 'Infrastructure Reference'].includes(activeTab) ? 4 : activeTab === 'Training Reference' ? 3 : 2)} className="px-6 py-4 text-center text-sm text-gray-500">No items found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Show</span>
                        <select 
                            value={itemsPerPage} 
                            onChange={(e) => setItemsPerPage(Number(e.target.value))} 
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                        >
                            {[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}
                        </select>
                        <span className="text-gray-700 dark:text-gray-300">entries</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">
                            Showing {activeData.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, activeData.length)} of {activeData.length} entries
                        </span>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                                disabled={currentPage === 1} 
                                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                Previous
                            </button>
                            <span className="px-2 font-medium text-gray-700 dark:text-gray-300">{currentPage} / {totalPages}</span>
                            <button 
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                                disabled={currentPage === totalPages} 
                                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && canEdit && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl ${activeTab === 'Crop Reference' || activeTab === 'Livestock Reference' ? 'max-w-2xl' : 'max-w-md'} w-full p-6 max-h-[90vh] overflow-y-auto`}>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            {editingItem ? 'Edit' : 'Add New'} {activeTab === 'UACS' ? 'UACS Code' : activeTab === 'Items' ? 'Subproject Item' : activeTab === 'Crop Reference' ? 'Crop Reference' : activeTab === 'Livestock Reference' ? 'Livestock Reference' : activeTab === 'Equipment Reference' ? 'Equipment Reference' : activeTab === 'Agricultural Input Reference' ? 'Agricultural Input Reference' : activeTab === 'Infrastructure Reference' ? 'Infrastructure Reference' : activeTab === 'Training Reference' ? 'Training Reference' : activeTab === 'GIDA' ? 'GIDA Area' : 'ELCAC Area'}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            {activeTab === 'UACS' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Object Type</label>
                                        <select 
                                            value={uacsForm.objectType}
                                            onChange={e => setUacsForm({...uacsForm, objectType: e.target.value})}
                                            className={commonInputClasses}
                                        >
                                            {objectTypes.map(ot => <option key={ot} value={ot}>{ot}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particular</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={uacsForm.particular}
                                            onChange={e => setUacsForm({...uacsForm, particular: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UACS Code</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={uacsForm.uacsCode}
                                            onChange={e => setUacsForm({...uacsForm, uacsCode: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={uacsForm.description}
                                            onChange={e => setUacsForm({...uacsForm, description: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                </>
                            ) : activeTab === 'Items' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Item Type</label>
                                        <input 
                                            type="text" 
                                            required
                                            list="item-types"
                                            value={itemForm.type}
                                            onChange={e => setItemForm({...itemForm, type: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                        <datalist id="item-types">
                                            <option value="Agricultural Inputs" />
                                            <option value="Equipment" />
                                            <option value="Infrastructure" />
                                            <option value="Others" />
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Item Particular</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={itemForm.particular}
                                            onChange={e => setItemForm({...itemForm, particular: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                </>
                            ) : activeTab === 'Crop Reference' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.name}>
                                            Name <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refCommodityForm.name} onChange={e => setRefCommodityForm({...refCommodityForm, name: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.banner_program}>
                                            Banner Program <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refCommodityForm.banner_program} onChange={e => setRefCommodityForm({...refCommodityForm, banner_program: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.commodity_group}>
                                            Commodity Group <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refCommodityForm.commodity_group} onChange={e => setRefCommodityForm({...refCommodityForm, commodity_group: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.min_elevation_masl}>
                                                Min Elev (masl) <Info className="h-3 w-3 text-gray-400" />
                                             </label>
                                            <input type="number" required value={refCommodityForm.min_elevation_masl} onChange={e => setRefCommodityForm({...refCommodityForm, min_elevation_masl: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.max_elevation_masl}>
                                                Max Elev (masl) <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="number" required value={refCommodityForm.max_elevation_masl} onChange={e => setRefCommodityForm({...refCommodityForm, max_elevation_masl: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.max_slope_percent}>
                                            Max Slope (%) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refCommodityForm.max_slope_percent} onChange={e => setRefCommodityForm({...refCommodityForm, max_slope_percent: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.wet_season_start}>
                                                Wet Season Start <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="text" required value={refCommodityForm.wet_season_start} onChange={e => setRefCommodityForm({...refCommodityForm, wet_season_start: e.target.value})} className={commonInputClasses} />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.dry_season_start}>
                                                Dry Season Start <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="text" required value={refCommodityForm.dry_season_start} onChange={e => setRefCommodityForm({...refCommodityForm, dry_season_start: e.target.value})} className={commonInputClasses} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.recommended_soil}>
                                            Recommended Soil <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refCommodityForm.recommended_soil} onChange={e => setRefCommodityForm({...refCommodityForm, recommended_soil: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.fertilizer_npk}>
                                            Fertilizer NPK <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refCommodityForm.fertilizer_npk} onChange={e => setRefCommodityForm({...refCommodityForm, fertilizer_npk: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.watering_method}>
                                            Watering Method <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refCommodityForm.watering_method} onChange={e => setRefCommodityForm({...refCommodityForm, watering_method: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.harvest_period_days}>
                                                Harvest (days) <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="number" required value={refCommodityForm.harvest_period_days} onChange={e => setRefCommodityForm({...refCommodityForm, harvest_period_days: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.target_yield_ha}>
                                                Target Yield (t/ha) <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="number" step="0.01" required value={refCommodityForm.target_yield_ha} onChange={e => setRefCommodityForm({...refCommodityForm, target_yield_ha: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.ph_min}>
                                                pH Min <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="number" step="0.1" required value={refCommodityForm.ph_min} onChange={e => setRefCommodityForm({...refCommodityForm, ph_min: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.ph_max}>
                                                pH Max <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="number" step="0.1" required value={refCommodityForm.ph_max} onChange={e => setRefCommodityForm({...refCommodityForm, ph_max: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={CROP_TOOLTIPS.climate_type_suitability}>
                                            Climate Suitability <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refCommodityForm.climate_type_suitability} onChange={e => setRefCommodityForm({...refCommodityForm, climate_type_suitability: e.target.value})} className={commonInputClasses} />
                                    </div>
                                </div>
                            ) : activeTab === 'Livestock Reference' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.name}>
                                            Breed/Common Name <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refLivestockForm.name} onChange={e => setRefLivestockForm({...refLivestockForm, name: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.category}>
                                            Livestock Type <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <select 
                                            required 
                                            value={refLivestockForm.category} 
                                            onChange={e => setRefLivestockForm({...refLivestockForm, category: e.target.value as any})} 
                                            className={commonInputClasses}
                                        >
                                            <option value="Poultry">Poultry</option>
                                            <option value="Ruminant">Ruminant</option>
                                            <option value="Swine">Swine</option>
                                            <option value="Small Livestock">Small Livestock</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.breed_type}>
                                            Genetics <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refLivestockForm.breed_type} onChange={e => setRefLivestockForm({...refLivestockForm, breed_type: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.housing_type}>
                                            Housing System <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refLivestockForm.housing_type} onChange={e => setRefLivestockForm({...refLivestockForm, housing_type: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.min_space_sqm_per_head}>
                                            Space Requirement (sqm) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" step="0.01" required value={refLivestockForm.min_space_sqm_per_head} onChange={e => setRefLivestockForm({...refLivestockForm, min_space_sqm_per_head: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.min_temp_celsius}>
                                                Min Temp (°C) <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="number" required value={refLivestockForm.min_temp_celsius} onChange={e => setRefLivestockForm({...refLivestockForm, min_temp_celsius: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.max_temp_celsius}>
                                                Max Temp (°C) <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="number" required value={refLivestockForm.max_temp_celsius} onChange={e => setRefLivestockForm({...refLivestockForm, max_temp_celsius: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.gestation_incubation_days}>
                                            Gestation/Incubation <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refLivestockForm.gestation_incubation_days} onChange={e => setRefLivestockForm({...refLivestockForm, gestation_incubation_days: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.maturity_days}>
                                                Market Maturity <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="number" required value={refLivestockForm.maturity_days} onChange={e => setRefLivestockForm({...refLivestockForm, maturity_days: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.productive_years}>
                                                Economic Lifespan <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="number" required value={refLivestockForm.productive_years} onChange={e => setRefLivestockForm({...refLivestockForm, productive_years: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.feed_type}>
                                            Feeding Protocol <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refLivestockForm.feed_type} onChange={e => setRefLivestockForm({...refLivestockForm, feed_type: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.target_fcr}>
                                            Target FCR <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" step="0.01" required value={refLivestockForm.target_fcr} onChange={e => setRefLivestockForm({...refLivestockForm, target_fcr: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.target_weight_kg}>
                                            Market Weight (kg) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" step="0.01" required value={refLivestockForm.target_weight_kg} onChange={e => setRefLivestockForm({...refLivestockForm, target_weight_kg: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.water_liters_per_day}>
                                            Daily Water (L) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" step="0.1" required value={refLivestockForm.water_liters_per_day} onChange={e => setRefLivestockForm({...refLivestockForm, water_liters_per_day: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    {refLivestockForm.category === 'Poultry' && (
                                        <div>
                                            <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={LIVESTOCK_TOOLTIPS.avg_eggs_per_year}>
                                                Annual Egg Yield <Info className="h-3 w-3 text-gray-400" />
                                            </label>
                                            <input type="number" required value={refLivestockForm.avg_eggs_per_year} onChange={e => setRefLivestockForm({...refLivestockForm, avg_eggs_per_year: Number(e.target.value)})} className={commonInputClasses} />
                                        </div>
                                    )}
                                </div>
                            ) : activeTab === 'Equipment Reference' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.name}>
                                            Equipment Name <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refEquipmentForm.name} onChange={e => setRefEquipmentForm({...refEquipmentForm, name: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.category}>
                                            Category <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refEquipmentForm.category} onChange={e => setRefEquipmentForm({...refEquipmentForm, category: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.equipment_type}>
                                            Equipment Type <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refEquipmentForm.equipment_type} onChange={e => setRefEquipmentForm({...refEquipmentForm, equipment_type: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.power_source}>
                                            Power Source <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refEquipmentForm.power_source} onChange={e => setRefEquipmentForm({...refEquipmentForm, power_source: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.capacity_rating}>
                                            Capacity Rating <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refEquipmentForm.capacity_rating} onChange={e => setRefEquipmentForm({...refEquipmentForm, capacity_rating: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.fuel_consumption_rate}>
                                            Fuel Rate (L/hr) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" step="0.1" required value={refEquipmentForm.fuel_consumption_rate} onChange={e => setRefEquipmentForm({...refEquipmentForm, fuel_consumption_rate: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.estimated_useful_life_years}>
                                            Useful Life (yrs) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refEquipmentForm.estimated_useful_life_years} onChange={e => setRefEquipmentForm({...refEquipmentForm, estimated_useful_life_years: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.unit_cost_estimate}>
                                            Est. Unit Cost <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refEquipmentForm.unit_cost_estimate} onChange={e => setRefEquipmentForm({...refEquipmentForm, unit_cost_estimate: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.maintenance_interval_months}>
                                            Maint. Interval (mo) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refEquipmentForm.maintenance_interval_months} onChange={e => setRefEquipmentForm({...refEquipmentForm, maintenance_interval_months: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.required_operators}>
                                            Req. Operators <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refEquipmentForm.required_operators} onChange={e => setRefEquipmentForm({...refEquipmentForm, required_operators: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={EQUIPMENT_TOOLTIPS.safety_gear_required}>
                                            Safety Gear <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refEquipmentForm.safety_gear_required} onChange={e => setRefEquipmentForm({...refEquipmentForm, safety_gear_required: e.target.value})} className={commonInputClasses} />
                                    </div>
                                </div>
                            ) : activeTab === 'Agricultural Input Reference' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INPUT_TOOLTIPS.name}>
                                            Product Name <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refInputForm.name} onChange={e => setRefInputForm({...refInputForm, name: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INPUT_TOOLTIPS.input_type}>
                                            Input Type <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refInputForm.input_type} onChange={e => setRefInputForm({...refInputForm, input_type: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INPUT_TOOLTIPS.sub_type}>
                                            Sub-Type <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refInputForm.sub_type} onChange={e => setRefInputForm({...refInputForm, sub_type: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INPUT_TOOLTIPS.standard_uom}>
                                            Standard UOM <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refInputForm.standard_uom} onChange={e => setRefInputForm({...refInputForm, standard_uom: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INPUT_TOOLTIPS.avg_price_2026}>
                                            Avg Price (2026) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refInputForm.avg_price_2026} onChange={e => setRefInputForm({...refInputForm, avg_price_2026: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INPUT_TOOLTIPS.fpa_registration_no}>
                                            FPA Reg No. <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refInputForm.fpa_registration_no} onChange={e => setRefInputForm({...refInputForm, fpa_registration_no: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INPUT_TOOLTIPS.shelf_life_months}>
                                            Shelf Life (mo) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refInputForm.shelf_life_months} onChange={e => setRefInputForm({...refInputForm, shelf_life_months: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INPUT_TOOLTIPS.application_rate_per_ha}>
                                            App. Rate (/ha) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refInputForm.application_rate_per_ha} onChange={e => setRefInputForm({...refInputForm, application_rate_per_ha: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INPUT_TOOLTIPS.hazchem_rating}>
                                            Hazchem Rating <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refInputForm.hazchem_rating} onChange={e => setRefInputForm({...refInputForm, hazchem_rating: e.target.value})} className={commonInputClasses} />
                                    </div>
                                </div>
                            ) : activeTab === 'Infrastructure Reference' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INFRASTRUCTURE_TOOLTIPS.name}>
                                            Project Name <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refInfrastructureForm.name} onChange={e => setRefInfrastructureForm({...refInfrastructureForm, name: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INFRASTRUCTURE_TOOLTIPS.category}>
                                            Category <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refInfrastructureForm.category} onChange={e => setRefInfrastructureForm({...refInfrastructureForm, category: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INFRASTRUCTURE_TOOLTIPS.structure_type}>
                                            Structure Type <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refInfrastructureForm.structure_type} onChange={e => setRefInfrastructureForm({...refInfrastructureForm, structure_type: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INFRASTRUCTURE_TOOLTIPS.capacity_rating}>
                                            Capacity Rating <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refInfrastructureForm.capacity_rating} onChange={e => setRefInfrastructureForm({...refInfrastructureForm, capacity_rating: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INFRASTRUCTURE_TOOLTIPS.unit_cost_estimate}>
                                            Unit Cost Estimate <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refInfrastructureForm.unit_cost_estimate} onChange={e => setRefInfrastructureForm({...refInfrastructureForm, unit_cost_estimate: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INFRASTRUCTURE_TOOLTIPS.estimated_useful_life_years}>
                                            Estimated Useful Life (Years) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refInfrastructureForm.estimated_useful_life_years} onChange={e => setRefInfrastructureForm({...refInfrastructureForm, estimated_useful_life_years: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INFRASTRUCTURE_TOOLTIPS.maintenance_interval_months}>
                                            Maint. Interval (Months) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refInfrastructureForm.maintenance_interval_months} onChange={e => setRefInfrastructureForm({...refInfrastructureForm, maintenance_interval_months: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={INFRASTRUCTURE_TOOLTIPS.required_permits}>
                                            Required Permits <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" value={refInfrastructureForm.required_permits} onChange={e => setRefInfrastructureForm({...refInfrastructureForm, required_permits: e.target.value})} className={commonInputClasses} placeholder="e.g. ECC, Building Permit" />
                                    </div>
                                </div>
                            ) : activeTab === 'Training Reference' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.title}>
                                            Training Title <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refTrainingForm.title} onChange={e => setRefTrainingForm({...refTrainingForm, title: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.category}>
                                            Category <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refTrainingForm.category} onChange={e => setRefTrainingForm({...refTrainingForm, category: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.standard_duration_days}>
                                            Duration (days) <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refTrainingForm.standard_duration_days} onChange={e => setRefTrainingForm({...refTrainingForm, standard_duration_days: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.delivery_mode}>
                                            Delivery Mode <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <select value={refTrainingForm.delivery_mode} onChange={e => setRefTrainingForm({...refTrainingForm, delivery_mode: e.target.value})} className={commonInputClasses}>
                                            <option value="Face-to-Face">Face-to-Face</option>
                                            <option value="Blended">Blended</option>
                                            <option value="Virtual">Virtual</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.accrediting_body}>
                                            Accrediting Body <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refTrainingForm.accrediting_body} onChange={e => setRefTrainingForm({...refTrainingForm, accrediting_body: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.minimum_participants}>
                                            Min Participants <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="number" required value={refTrainingForm.minimum_participants} onChange={e => setRefTrainingForm({...refTrainingForm, minimum_participants: Number(e.target.value)})} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.certification_type}>
                                            Certification Type <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <input type="text" required value={refTrainingForm.certification_type} onChange={e => setRefTrainingForm({...refTrainingForm, certification_type: e.target.value})} className={commonInputClasses} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.target_audience}>
                                            Target Audience <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <textarea value={refTrainingForm.target_audience} onChange={e => setRefTrainingForm({...refTrainingForm, target_audience: e.target.value})} className={commonInputClasses} rows={2} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.required_facilities}>
                                            Required Facilities <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <textarea value={refTrainingForm.required_facilities} onChange={e => setRefTrainingForm({...refTrainingForm, required_facilities: e.target.value})} className={commonInputClasses} rows={2} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.key_modules}>
                                            Key Modules <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <textarea value={refTrainingForm.key_modules} onChange={e => setRefTrainingForm({...refTrainingForm, key_modules: e.target.value})} className={commonInputClasses} rows={2} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300" title={TRAINING_TOOLTIPS.expected_competency}>
                                            Expected Competency <Info className="h-3 w-3 text-gray-400" />
                                        </label>
                                        <textarea value={refTrainingForm.expected_competency} onChange={e => setRefTrainingForm({...refTrainingForm, expected_competency: e.target.value})} className={commonInputClasses} rows={2} />
                                    </div>
                                </div>
                            ) : activeTab === 'GIDA' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Region</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={gidaForm.region}
                                            onChange={e => setGidaForm({...gidaForm, region: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Province</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={gidaForm.province}
                                            onChange={e => setGidaForm({...gidaForm, province: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Municipality</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={gidaForm.municipality}
                                            onChange={e => setGidaForm({...gidaForm, municipality: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Barangay</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={gidaForm.barangay}
                                            onChange={e => setGidaForm({...gidaForm, barangay: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Region</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={elcacForm.region}
                                            onChange={e => setElcacForm({...elcacForm, region: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Province</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={elcacForm.province}
                                            onChange={e => setElcacForm({...elcacForm, province: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Municipality</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={elcacForm.municipality}
                                            onChange={e => setElcacForm({...elcacForm, municipality: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Barangay</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={elcacForm.barangay}
                                            onChange={e => setElcacForm({...elcacForm, barangay: e.target.value})}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                </>
                            )}
                            <div className="flex justify-end space-x-3 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteItem && canEdit && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Delete</h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Are you sure you want to delete this item? This action cannot be undone.
                        </p>
                        <div className="flex justify-end space-x-3 pt-4">
                            <button 
                                onClick={() => setDeleteItem(null)}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleDeleteConfirm}
                                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default References;
