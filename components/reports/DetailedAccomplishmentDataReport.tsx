// Author: 4K
import React, { useEffect, useMemo, useState } from 'react';
import { Download, Printer, RotateCcw, Save, Search, SlidersHorizontal, X } from 'lucide-react';
import { ActivityComponentType, IPO, OtherActivity, Subproject, Training } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { parseLocation } from '../LocationPicker';
import { ReportExcelRequest, ReportPrintRequest, isDateInReportingYear, withReportYearLabel } from './ReportUtils';

interface DetailedAccomplishmentDataReportProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        ipos: IPO[];
    };
    selectedYear: string;
    selectedReportingYear: string;
    selectedOu: string;
    selectedTier: string;
    selectedFundType: string;
    onPrintReport: (request: ReportPrintRequest) => void;
    onExportReport: (request: ReportExcelRequest) => void;
}

interface DetailedAccomplishmentRow {
    id: string;
    sourceGroup: DisplaySourceGroup;
    level3Key: string;
    beneficiaryLocationKeys: string[];
    fundingYear: string;
    region: string;
    interventionGeocode: string;
    province: string;
    cityMunicipality: string;
    barangay: string;
    project: string;
    interventionType: string;
    prexcProgram: string;
    performanceIndicatorLevel1: string;
    performanceIndicatorLevel2: string;
    performanceIndicatorLevel3: string;
    unitOfMeasure: string;
    quantity: number;
    beneficiaryProvince: string;
    beneficiaryCityMunicipality: string;
    beneficiaryBarangay: string;
    nameOfAssociationOrganization: string;
    totalNumber: number | '';
    indigenousPeople: string;
    nameOfTribe: string;
    srCitizen: number | '';
    pwd: number | '';
    arb: string;
    fourPs: string;
    contactNumber: string;
    dateReceived: string;
}

interface PsgcLocationItem {
    code: string;
    name: string;
    regionCode?: string;
}

type QuarterFilter = 'All' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
type DisplaySourceGroup = 'Packages' | 'Activities';

interface ReportDisplaySettings {
    hiddenLevel3Keys: string[];
    hiddenSourceGroups: DisplaySourceGroup[];
}

interface Level3Option {
    key: string;
    label: string;
    sourceGroup: DisplaySourceGroup;
    rowCount: number;
}

const PSGC_API_BASE = 'https://psgc.gitlab.io/api';
const REPORT_DISPLAY_KEY = 'detailed_accomplishment_data';
const DISPLAY_SOURCE_GROUPS: DisplaySourceGroup[] = ['Packages', 'Activities'];
const DEFAULT_DISPLAY_SETTINGS: ReportDisplaySettings = {
    hiddenLevel3Keys: [],
    hiddenSourceGroups: [],
};

const psgcCache = {
    regions: null as Promise<PsgcLocationItem[]> | null,
    provinces: null as Promise<PsgcLocationItem[]> | null,
    citiesByProvince: new Map<string, Promise<PsgcLocationItem[]>>(),
    citiesByRegion: new Map<string, Promise<PsgcLocationItem[]>>(),
    barangaysByCity: new Map<string, Promise<PsgcLocationItem[]>>(),
    geocodesByLocation: new Map<string, Promise<string>>(),
};

const columns: { key: keyof DetailedAccomplishmentRow; label: string; numeric?: boolean; width: number }[] = [
    { key: 'fundingYear', label: 'FUNDING YEAR', width: 120 },
    { key: 'region', label: 'REGION', width: 190 },
    { key: 'interventionGeocode', label: 'INTERVENTION GEOCODE', width: 155 },
    { key: 'province', label: 'PROVINCE', width: 150 },
    { key: 'cityMunicipality', label: 'CITY/MUNICIPALITY', width: 180 },
    { key: 'barangay', label: 'BARANGAY', width: 150 },
    { key: 'project', label: 'PROJECT', width: 95 },
    { key: 'interventionType', label: 'INTERVENTION TYPE', width: 155 },
    { key: 'prexcProgram', label: 'PREXC PROGRAM', width: 145 },
    { key: 'performanceIndicatorLevel1', label: 'PERFORMANCE INDICATOR LEVEL 1', width: 220 },
    { key: 'performanceIndicatorLevel2', label: 'PERFORMANCE INDICATOR LEVEL 2', width: 320 },
    { key: 'performanceIndicatorLevel3', label: 'PERFORMANCE INDICATOR LEVEL 3', width: 260 },
    { key: 'unitOfMeasure', label: 'UNIT OF MEASURE', width: 140 },
    { key: 'quantity', label: 'QUANTITY', numeric: true, width: 105 },
    { key: 'beneficiaryProvince', label: 'PROVINCE', width: 150 },
    { key: 'beneficiaryCityMunicipality', label: 'CITY/MUNICIPALITY', width: 180 },
    { key: 'beneficiaryBarangay', label: 'BARANGAY', width: 150 },
    { key: 'nameOfAssociationOrganization', label: 'NAME OF ASSOCIATION/ORGANIZATION', width: 300 },
    { key: 'totalNumber', label: 'TOTAL NUMBER', numeric: true, width: 130 },
    { key: 'indigenousPeople', label: 'INDIGENOUS PEOPLE (Y/N)', width: 175 },
    { key: 'nameOfTribe', label: 'NAME OF TRIBE', width: 190 },
    { key: 'srCitizen', label: 'SR CITIZEN', numeric: true, width: 115 },
    { key: 'pwd', label: 'PWD', numeric: true, width: 90 },
    { key: 'arb', label: 'ARB', width: 90 },
    { key: 'fourPs', label: '4Ps', width: 90 },
    { key: 'contactNumber', label: 'CONTACT NUMBER', width: 170 },
    { key: 'dateReceived', label: 'DATE RECEIVED', width: 140 },
];

const normalizeText = (value?: string) => (value || '')
    .toLowerCase()
    .replace(/^(brgy\.?|barangay|city of|municipality of|province of)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const makeLevel3Key = (sourceGroup: DisplaySourceGroup, level3: string) => `${sourceGroup}:${normalizeText(level3)}`;

const normalizeReportDisplaySettings = (settings: any): ReportDisplaySettings => {
    const hiddenLevel3Keys: string[] = Array.isArray(settings?.hiddenLevel3Keys)
        ? Array.from(new Set<string>(settings.hiddenLevel3Keys.map((key: unknown) => String(key || '').trim()).filter(Boolean)))
        : [];
    const hiddenSourceGroups: DisplaySourceGroup[] = Array.isArray(settings?.hiddenSourceGroups)
        ? Array.from(new Set<DisplaySourceGroup>(settings.hiddenSourceGroups.filter((group: unknown): group is DisplaySourceGroup => (
            typeof group === 'string' && DISPLAY_SOURCE_GROUPS.includes(group as DisplaySourceGroup)
        ))))
        : [];

    return {
        hiddenLevel3Keys,
        hiddenSourceGroups,
    };
};

const areDisplaySettingsEqual = (a: ReportDisplaySettings, b: ReportDisplaySettings) => {
    const sortValues = (values: string[]) => [...values].sort();
    return JSON.stringify(sortValues(a.hiddenLevel3Keys)) === JSON.stringify(sortValues(b.hiddenLevel3Keys))
        && JSON.stringify(sortValues(a.hiddenSourceGroups)) === JSON.stringify(sortValues(b.hiddenSourceGroups));
};

const cleanBarangay = (value?: string) => (value || '').replace(/^(Brgy\.?|Barangay|Sitio)\s+/i, '').trim();

const uniqueValues = (values: Array<string | number | undefined | null>) => {
    const seen = new Set<string>();
    return values
        .map(value => value === undefined || value === null ? '' : String(value).trim())
        .filter(value => {
            if (!value || seen.has(value)) return false;
            seen.add(value);
            return true;
        });
};

const joinUnique = (values: Array<string | number | undefined | null>) => uniqueValues(values).join('; ');

const joinAligned = (values: Array<string | number | undefined | null>) => values
    .map(value => value === undefined || value === null ? '' : String(value).trim())
    .filter(Boolean)
    .join('; ');

const toDisplayNumber = (value?: number) => {
    const numeric = Number(value) || 0;
    return numeric > 0 ? numeric : '';
};

const getQuarterFromDate = (dateString?: string): QuarterFilter | '' => {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter}` as QuarterFilter;
};

const parseBeneficiaryLocation = (location: string, region?: string) => {
    const parsed = parseLocation(location);
    const parts = (location || '').split(',').map(part => part.trim()).filter(Boolean);
    const isNcr = normalizeText(region).includes('national capital region') || normalizeText(region) === 'ncr';

    if (isNcr && parts.length === 1) {
        return { province: '', cityMunicipality: parts[0], barangay: '' };
    }

    if (isNcr && parts.length === 2 && /^(Brgy\.?|Barangay|Sitio)\s+/i.test(parts[0])) {
        return { province: '', cityMunicipality: parts[1], barangay: cleanBarangay(parts[0]) };
    }

    return {
        province: parsed.province,
        cityMunicipality: parsed.municipality,
        barangay: parsed.barangay,
    };
};

const fetchPsgc = async (path: string): Promise<PsgcLocationItem[]> => {
    const response = await fetch(`${PSGC_API_BASE}${path}`);
    if (!response.ok) throw new Error(`PSGC request failed: ${path}`);
    return response.json();
};

const getRegions = () => {
    if (!psgcCache.regions) psgcCache.regions = fetchPsgc('/regions/');
    return psgcCache.regions;
};

const getProvinces = () => {
    if (!psgcCache.provinces) psgcCache.provinces = fetchPsgc('/provinces/');
    return psgcCache.provinces;
};

const getCitiesByProvince = (provinceCode: string) => {
    if (!psgcCache.citiesByProvince.has(provinceCode)) {
        psgcCache.citiesByProvince.set(provinceCode, fetchPsgc(`/provinces/${provinceCode}/cities-municipalities/`));
    }
    return psgcCache.citiesByProvince.get(provinceCode)!;
};

const getCitiesByRegion = (regionCode: string) => {
    if (!psgcCache.citiesByRegion.has(regionCode)) {
        psgcCache.citiesByRegion.set(regionCode, fetchPsgc(`/regions/${regionCode}/cities-municipalities/`));
    }
    return psgcCache.citiesByRegion.get(regionCode)!;
};

const getBarangaysByCity = (cityCode: string) => {
    if (!psgcCache.barangaysByCity.has(cityCode)) {
        psgcCache.barangaysByCity.set(cityCode, fetchPsgc(`/cities-municipalities/${cityCode}/barangays/`));
    }
    return psgcCache.barangaysByCity.get(cityCode)!;
};

const findExact = (items: PsgcLocationItem[], name?: string) => {
    const normalized = normalizeText(name);
    return normalized ? items.find(item => normalizeText(item.name) === normalized) : undefined;
};

const findRegion = (items: PsgcLocationItem[], region?: string) => {
    const normalized = normalizeText(region);
    if (!normalized) return undefined;
    return items.find(item => {
        const itemName = normalizeText(item.name);
        return itemName === normalized || itemName.includes(normalized) || normalized.includes(itemName);
    });
};

const resolvePsgcCode = async (location: string, region?: string) => {
    const cacheKey = `${region || ''}|${location || ''}`;
    if (psgcCache.geocodesByLocation.has(cacheKey)) return psgcCache.geocodesByLocation.get(cacheKey)!;

    const promise = (async () => {
        try {
            const parsed = parseBeneficiaryLocation(location, region);
            const [regions, provinces] = await Promise.all([getRegions(), getProvinces()]);
            const regionMatch = findRegion(regions, region);
            const provinceMatch = findExact(provinces, parsed.province);

            let cities: PsgcLocationItem[] = [];
            if (provinceMatch) {
                cities = await getCitiesByProvince(provinceMatch.code);
            } else if (regionMatch) {
                cities = await getCitiesByRegion(regionMatch.code);
            }

            const cityMatch = findExact(cities, parsed.cityMunicipality);
            if (cityMatch && parsed.barangay) {
                const barangays = await getBarangaysByCity(cityMatch.code);
                const barangayCodes = uniqueValues(
                    parsed.barangay
                        .split(',')
                        .map(barangay => findExact(barangays, cleanBarangay(barangay))?.code)
                );
                if (barangayCodes.length > 0) return barangayCodes.join(', ');
            }

            if (cityMatch) return cityMatch.code;
            if (provinceMatch) return provinceMatch.code;
            if (regionMatch) return regionMatch.code;
        } catch (error) {
            console.warn('Unable to resolve PSGC geocode', { location, region, error });
        }
        return '';
    })();

    psgcCache.geocodesByLocation.set(cacheKey, promise);
    return promise;
};

const getLevel2 = (component: ActivityComponentType | 'Production and Livelihood', sourceType: 'Subproject' | 'Activity') => {
    if (component === 'Social Preparation') return 'IPO organized and capacity developed';
    if (component === 'Marketing and Enterprise') return 'IPOs provided with marketing assistance';
    if (component === 'Production and Livelihood' && sourceType === 'Subproject') {
        return 'IPOs provided with commodity production and livelihood subprojects';
    }
    if (component === 'Production and Livelihood') return 'IPO capacity building provided';
    return '';
};

const findIpoById = (ipos: IPO[], id?: number) => id ? ipos.find(ipo => Number(ipo.id) === Number(id)) : undefined;

const findIpoByName = (ipos: IPO[], name?: string) => {
    const normalized = normalizeText(name);
    return normalized ? ipos.find(ipo => normalizeText(ipo.name) === normalized) : undefined;
};

const dedupeIpos = (ipos: Array<IPO | undefined>) => {
    const seen = new Set<string>();
    return ipos.filter((ipo): ipo is IPO => {
        if (!ipo) return false;
        const key = ipo.id ? `id:${ipo.id}` : `name:${normalizeText(ipo.name)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const buildBeneficiaryFields = (ipos: IPO[]) => {
    const locations = ipos.map(ipo => parseBeneficiaryLocation(ipo.location, ipo.region));
    return {
        region: joinUnique(ipos.map(ipo => ipo.region)),
        province: joinUnique(locations.map(location => location.province)),
        cityMunicipality: joinUnique(locations.map(location => location.cityMunicipality)),
        barangay: joinUnique(locations.map(location => location.barangay)),
        beneficiaryLocationKeys: ipos.map(ipo => `${ipo.region || ''}|${ipo.location || ''}`),
        names: joinUnique(ipos.map(ipo => ipo.name)),
        indigenousPeople: joinAligned(ipos.map(ipo => (ipo.totalIpMembers || ipo.indigenousCulturalCommunity) ? 'Y' : 'N')),
        tribes: joinUnique(ipos.map(ipo => ipo.indigenousCulturalCommunity)),
        contacts: joinUnique(ipos.map(ipo => ipo.contactNumber)),
    };
};

const DetailedAccomplishmentDataReport: React.FC<DetailedAccomplishmentDataReportProps> = ({
    data,
    selectedYear,
    selectedReportingYear,
    selectedOu,
    selectedTier,
    selectedFundType,
    onPrintReport,
    onExportReport,
}) => {
    const { currentUser } = useAuth();
    const isReportAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const [geocodes, setGeocodes] = useState<Record<string, string>>({});
    const [selectedQuarter, setSelectedQuarter] = useState<QuarterFilter>('All');
    const [controllerOpen, setControllerOpen] = useState(false);
    const [controllerSearch, setControllerSearch] = useState('');
    const [controllerSettings, setControllerSettings] = useState<ReportDisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
    const [draftSettings, setDraftSettings] = useState<ReportDisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
    const [controllerLoading, setControllerLoading] = useState(false);
    const [controllerSaving, setControllerSaving] = useState(false);
    const [controllerError, setControllerError] = useState('');
    const [controllerMessage, setControllerMessage] = useState('');

    const ipoRegistry = useMemo(() => data.ipos || [], [data.ipos]);

    useEffect(() => {
        let cancelled = false;

        const loadControllerSettings = async () => {
            if (!supabase) {
                setControllerError('Supabase is not configured. The report is showing all Level 3 items.');
                return;
            }

            setControllerLoading(true);
            setControllerError('');
            try {
                const { data: settingRow, error } = await supabase
                    .from('report_display_settings')
                    .select('settings')
                    .eq('report_key', REPORT_DISPLAY_KEY)
                    .maybeSingle();

                if (cancelled) return;

                if (error) {
                    console.error('Unable to load detailed accomplishment report display settings:', error);
                    setControllerError('Display controller settings could not be loaded. The report is showing all Level 3 items.');
                    setControllerSettings(DEFAULT_DISPLAY_SETTINGS);
                    setDraftSettings(DEFAULT_DISPLAY_SETTINGS);
                    return;
                }

                const normalized = normalizeReportDisplaySettings(settingRow?.settings);
                setControllerSettings(normalized);
                setDraftSettings(normalized);
            } finally {
                if (!cancelled) setControllerLoading(false);
            }
        };

        loadControllerSettings();

        return () => {
            cancelled = true;
        };
    }, []);

    const rows = useMemo<DetailedAccomplishmentRow[]>(() => {
        const subprojectRows = (data.subprojects || [])
            .filter(subproject => !!subproject.actualCompletionDate)
            .map(subproject => {
                const linkedIpos = dedupeIpos([
                    findIpoById(ipoRegistry, subproject.ipo_id),
                    findIpoByName(ipoRegistry, subproject.indigenousPeopleOrganization),
                ]);
                const beneficiary = buildBeneficiaryFields(linkedIpos);
                const component = 'Production and Livelihood';
                const performanceIndicatorLevel3 = `Subproject ${subproject.packageType || ''} delivered`.replace(/\s+/g, ' ').trim();

                return {
                    id: `subproject-${subproject.id}`,
                    sourceGroup: 'Packages',
                    level3Key: makeLevel3Key('Packages', performanceIndicatorLevel3),
                    beneficiaryLocationKeys: beneficiary.beneficiaryLocationKeys,
                    fundingYear: subproject.fundingYear?.toString() || '',
                    region: beneficiary.region,
                    interventionGeocode: '',
                    province: beneficiary.province,
                    cityMunicipality: beneficiary.cityMunicipality,
                    barangay: beneficiary.barangay,
                    project: '4K',
                    interventionType: 'Non-Infra',
                    prexcProgram: '',
                    performanceIndicatorLevel1: component,
                    performanceIndicatorLevel2: getLevel2(component, 'Subproject'),
                    performanceIndicatorLevel3,
                    unitOfMeasure: 'Project',
                    quantity: 1,
                    beneficiaryProvince: beneficiary.province,
                    beneficiaryCityMunicipality: beneficiary.cityMunicipality,
                    beneficiaryBarangay: beneficiary.barangay,
                    nameOfAssociationOrganization: beneficiary.names || subproject.indigenousPeopleOrganization || '',
                    totalNumber: linkedIpos.reduce((sum, ipo) => sum + (Number(ipo.totalMembers) || 0), 0) || '',
                    indigenousPeople: beneficiary.indigenousPeople,
                    nameOfTribe: beneficiary.tribes,
                    srCitizen: toDisplayNumber(subproject.actualSenior),
                    pwd: toDisplayNumber(subproject.actualPWD),
                    arb: '',
                    fourPs: '',
                    contactNumber: beneficiary.contacts,
                    dateReceived: subproject.actualCompletionDate || '',
                };
            });

        const activityRows = [...(data.trainings || []), ...(data.otherActivities || [])]
            .filter(activity => !!activity.actualDate && activity.component !== 'Program Management')
            .map(activity => {
                const idMatches = (activity.participating_ipo_ids || []).map(id => findIpoById(ipoRegistry, id));
                const nameMatches = (activity.participatingIpos || []).map(name => findIpoByName(ipoRegistry, name));
                const linkedIpos = dedupeIpos([...idMatches, ...nameMatches]);
                const beneficiary = buildBeneficiaryFields(linkedIpos);
                const component = activity.component;
                const performanceIndicatorLevel3 = `${activity.name} conducted`.replace(/\s+/g, ' ').trim();

                return {
                    id: `activity-${activity.id}`,
                    sourceGroup: 'Activities',
                    level3Key: makeLevel3Key('Activities', performanceIndicatorLevel3),
                    beneficiaryLocationKeys: beneficiary.beneficiaryLocationKeys,
                    fundingYear: activity.fundingYear?.toString() || '',
                    region: beneficiary.region,
                    interventionGeocode: '',
                    province: beneficiary.province,
                    cityMunicipality: beneficiary.cityMunicipality,
                    barangay: beneficiary.barangay,
                    project: '4K',
                    interventionType: 'Non-Infra',
                    prexcProgram: '',
                    performanceIndicatorLevel1: component,
                    performanceIndicatorLevel2: getLevel2(component, 'Activity'),
                    performanceIndicatorLevel3,
                    unitOfMeasure: 'Activity',
                    quantity: 1,
                    beneficiaryProvince: beneficiary.province,
                    beneficiaryCityMunicipality: beneficiary.cityMunicipality,
                    beneficiaryBarangay: beneficiary.barangay,
                    nameOfAssociationOrganization: beneficiary.names || joinUnique(activity.participatingIpos || []),
                    totalNumber: (Number(activity.actualParticipantsMale) || 0) + (Number(activity.actualParticipantsFemale) || 0) || '',
                    indigenousPeople: beneficiary.indigenousPeople,
                    nameOfTribe: beneficiary.tribes,
                    srCitizen: toDisplayNumber(activity.actualSenior),
                    pwd: toDisplayNumber(activity.actualPWD),
                    arb: '',
                    fourPs: '',
                    contactNumber: beneficiary.contacts,
                    dateReceived: activity.actualDate || '',
                };
            });

        return [...subprojectRows, ...activityRows]
        .filter(row => isDateInReportingYear(row.dateReceived, selectedReportingYear, row.fundingYear))
        .sort((a, b) => {
            const dateCompare = a.dateReceived.localeCompare(b.dateReceived);
            if (dateCompare !== 0) return dateCompare;
            return a.performanceIndicatorLevel3.localeCompare(b.performanceIndicatorLevel3);
        });
    }, [data.subprojects, data.trainings, data.otherActivities, ipoRegistry, selectedReportingYear]);

    const quarterFilteredRows = useMemo(() => {
        if (selectedQuarter === 'All') return rows;
        return rows.filter(row => getQuarterFromDate(row.dateReceived) === selectedQuarter);
    }, [rows, selectedQuarter]);

    const level3Options = useMemo<Level3Option[]>(() => {
        const optionMap = new Map<string, Level3Option>();

        rows.forEach(row => {
            const existing = optionMap.get(row.level3Key);
            if (existing) {
                existing.rowCount += 1;
                return;
            }

            optionMap.set(row.level3Key, {
                key: row.level3Key,
                label: row.performanceIndicatorLevel3,
                sourceGroup: row.sourceGroup,
                rowCount: 1,
            });
        });

        return Array.from(optionMap.values()).sort((a, b) => {
            const groupCompare = a.sourceGroup.localeCompare(b.sourceGroup);
            if (groupCompare !== 0) return groupCompare;
            return a.label.localeCompare(b.label);
        });
    }, [rows]);

    const controllerFilteredRows = useMemo(() => {
        const hiddenGroups = new Set(controllerSettings.hiddenSourceGroups);
        const hiddenKeys = new Set(controllerSettings.hiddenLevel3Keys);

        return quarterFilteredRows.filter(row => !hiddenGroups.has(row.sourceGroup) && !hiddenKeys.has(row.level3Key));
    }, [controllerSettings, quarterFilteredRows]);

    const controllerStats = useMemo(() => {
        const hiddenGroups = new Set(controllerSettings.hiddenSourceGroups);
        const hiddenKeys = new Set(controllerSettings.hiddenLevel3Keys);
        const visible = quarterFilteredRows.filter(row => !hiddenGroups.has(row.sourceGroup) && !hiddenKeys.has(row.level3Key)).length;

        return {
            visible,
            hidden: quarterFilteredRows.length - visible,
            total: quarterFilteredRows.length,
        };
    }, [controllerSettings, quarterFilteredRows]);

    const controllerHasChanges = useMemo(
        () => !areDisplaySettingsEqual(controllerSettings, draftSettings),
        [controllerSettings, draftSettings]
    );

    const updateDraftSettings = (updater: (current: ReportDisplaySettings) => ReportDisplaySettings) => {
        setDraftSettings(current => normalizeReportDisplaySettings(updater(current)));
        setControllerMessage('');
    };

    const setGroupVisible = (sourceGroup: DisplaySourceGroup, visible: boolean) => {
        updateDraftSettings(current => ({
            ...current,
            hiddenSourceGroups: visible
                ? current.hiddenSourceGroups.filter(group => group !== sourceGroup)
                : Array.from(new Set([...current.hiddenSourceGroups, sourceGroup])),
            hiddenLevel3Keys: visible
                ? current.hiddenLevel3Keys.filter(key => !key.startsWith(`${sourceGroup}:`))
                : current.hiddenLevel3Keys,
        }));
    };

    const setLevel3Visible = (key: string, visible: boolean) => {
        updateDraftSettings(current => ({
            ...current,
            hiddenLevel3Keys: visible
                ? current.hiddenLevel3Keys.filter(hiddenKey => hiddenKey !== key)
                : Array.from(new Set([...current.hiddenLevel3Keys, key])),
        }));
    };

    const resetDraftToShowAll = () => {
        setDraftSettings(DEFAULT_DISPLAY_SETTINGS);
        setControllerMessage('');
    };

    const cancelControllerChanges = () => {
        setDraftSettings(controllerSettings);
        setControllerMessage('');
    };

    const saveControllerSettings = async () => {
        if (!supabase) {
            setControllerError('Supabase is not configured. Display controller settings cannot be saved.');
            return;
        }

        const normalized = normalizeReportDisplaySettings(draftSettings);
        setControllerSaving(true);
        setControllerError('');
        setControllerMessage('');

        try {
            const { error } = await supabase
                .from('report_display_settings')
                .upsert({
                    report_key: REPORT_DISPLAY_KEY,
                    settings: normalized,
                    updated_by: currentUser?.id || null,
                    updated_by_name: currentUser?.fullName || currentUser?.username || null,
                }, { onConflict: 'report_key' });

            if (error) {
                console.error('Unable to save detailed accomplishment report display settings:', error);
                setControllerError('Display controller settings could not be saved. Check that the report_display_settings migration has been applied.');
                return;
            }

            setControllerSettings(normalized);
            setDraftSettings(normalized);
            setControllerMessage('Display controller saved.');
        } finally {
            setControllerSaving(false);
        }
    };

    useEffect(() => {
        let cancelled = false;

        const loadGeocodes = async () => {
            const nextGeocodes: Record<string, string> = {};
            const uniqueLocationKeys = uniqueValues(controllerFilteredRows.flatMap(row => row.beneficiaryLocationKeys));

            await Promise.all(uniqueLocationKeys.map(async key => {
                const [region, location] = key.split('|');
                nextGeocodes[key] = await resolvePsgcCode(location, region);
            }));

            if (!cancelled) setGeocodes(nextGeocodes);
        };

        loadGeocodes();

        return () => {
            cancelled = true;
        };
    }, [controllerFilteredRows]);

    const displayRows = useMemo(() => controllerFilteredRows.map(row => ({
        ...row,
        interventionGeocode: joinUnique(row.beneficiaryLocationKeys.map(key => geocodes[key])),
    })), [controllerFilteredRows, geocodes]);

    const filteredLevel3Options = useMemo(() => {
        const search = normalizeText(controllerSearch);
        if (!search) return level3Options;
        return level3Options.filter(option => (
            normalizeText(option.label).includes(search) || normalizeText(option.sourceGroup).includes(search)
        ));
    }, [controllerSearch, level3Options]);

    const handleDownload = () => {
        const aoa = [
            ['PERFORMANCE INDICATOR', ...Array(13).fill(''), 'BENEFICIARY INFORMATION', ...Array(12).fill('')],
            columns.map(column => column.label),
            ...displayRows.map(row => columns.map(column => row[column.key] ?? '')),
        ];
        onExportReport({
            reportName: withReportYearLabel('Detailed Accomplishment Data', selectedYear, selectedReportingYear),
            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
            fileName: `Detailed_Accomplishment_Data_FY${selectedYear}_RY${selectedReportingYear}_${selectedOu}.xlsx`,
            sheets: [{
                sheetName: 'Detailed Accomp Data',
                rows: aoa,
                headerRowCount: 2,
                merges: [
                    { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
                    { s: { r: 0, c: 14 }, e: { r: 0, c: 26 } },
                ],
                columnWidths: columns.map(column => Math.max(12, Math.ceil(column.width / 8))),
                columnFormats: columns.reduce<Record<number, 'physical'>>((acc, column, index) => {
                    if (column.numeric) acc[index] = 'physical';
                    return acc;
                }, {}),
            }],
        });
    };

    return (
        <div className="report-card detailed-accomplishment-report-card">
            <div className="report-card__header print-hidden">
                <div>
                    <h3 className="report-card__title">Detailed Accomplishment Data</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Rows: {displayRows.length} | Quarter: {selectedQuarter === 'All' ? 'All Quarters' : selectedQuarter}
                        {isReportAdmin && ` | Controller: ${controllerStats.visible} visible, ${controllerStats.hidden} hidden`}
                    </p>
                    {controllerError && isReportAdmin && (
                        <p className="mt-1 text-xs font-bold text-red-600 dark:text-red-400">{controllerError}</p>
                    )}
                    {controllerMessage && isReportAdmin && (
                        <p className="mt-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">{controllerMessage}</p>
                    )}
                </div>
                <div className="report-card__actions">
                    <label className="sr-only" htmlFor="detailed-accomplishment-quarter-filter">Quarter</label>
                    <select
                        id="detailed-accomplishment-quarter-filter"
                        value={selectedQuarter}
                        onChange={(event) => setSelectedQuarter(event.target.value as QuarterFilter)}
                        className="form-control"
                        aria-label="Filter detailed accomplishment data by actual date quarter"
                    >
                        <option value="All">All Quarters</option>
                        <option value="Q1">Q1</option>
                        <option value="Q2">Q2</option>
                        <option value="Q3">Q3</option>
                        <option value="Q4">Q4</option>
                    </select>
                    {isReportAdmin && (
                        <button
                            type="button"
                            onClick={() => setControllerOpen(prev => !prev)}
                            className="btn btn-secondary btn-responsive"
                            aria-expanded={controllerOpen}
                            aria-controls="detailed-accomplishment-display-controller"
                        >
                            <SlidersHorizontal className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Display Controller</span>
                        </button>
                    )}
                    <button
                        onClick={() => onPrintReport({
                            reportName: withReportYearLabel('Detailed Accomplishment Data', selectedYear, selectedReportingYear),
                            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                            tableElementId: 'detailed-accomplishment-report-table',
                        })}
                        className="btn btn-secondary btn-responsive"
                        aria-label="Print report"
                    >
                        <Printer className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Print Report</span>
                    </button>
                    <button onClick={handleDownload} className="btn btn-primary btn-responsive" aria-label="Download XLSX">
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Download XLSX</span>
                    </button>
                </div>
            </div>

            {isReportAdmin && controllerOpen && (
                <section
                    id="detailed-accomplishment-display-controller"
                    className="print-hidden mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60"
                >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h4 className="text-sm font-black text-gray-900 dark:text-white">Display Controller</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                Controls which Performance Indicator Level 3 entries appear in this report for all users.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={resetDraftToShowAll}
                                className="btn btn-secondary btn-responsive"
                                disabled={controllerSaving}
                            >
                                <RotateCcw className="btn-symbol" aria-hidden="true" />
                                <span className="btn-text">Reset to show all</span>
                            </button>
                            <button
                                type="button"
                                onClick={cancelControllerChanges}
                                className="btn btn-secondary btn-responsive"
                                disabled={!controllerHasChanges || controllerSaving}
                            >
                                <X className="btn-symbol" aria-hidden="true" />
                                <span className="btn-text">Cancel</span>
                            </button>
                            <button
                                type="button"
                                onClick={saveControllerSettings}
                                className="btn btn-primary btn-responsive"
                                disabled={!controllerHasChanges || controllerSaving || controllerLoading}
                            >
                                <Save className="btn-symbol" aria-hidden="true" />
                                <span className="btn-text">{controllerSaving ? 'Saving...' : 'Save'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <label className="relative block">
                            <span className="sr-only">Search Level 3 items</span>
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                            <input
                                type="search"
                                value={controllerSearch}
                                onChange={(event) => setControllerSearch(event.target.value)}
                                className="form-control pl-9"
                                placeholder="Search Level 3 items..."
                            />
                        </label>
                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400">
                            {controllerHasChanges ? 'Unsaved changes' : 'Saved settings active'}
                        </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {DISPLAY_SOURCE_GROUPS.map(sourceGroup => {
                            const groupOptions = filteredLevel3Options.filter(option => option.sourceGroup === sourceGroup);
                            const groupHidden = draftSettings.hiddenSourceGroups.includes(sourceGroup);
                            const allGroupOptions = level3Options.filter(option => option.sourceGroup === sourceGroup);
                            const hiddenExactCount = allGroupOptions.filter(option => draftSettings.hiddenLevel3Keys.includes(option.key)).length;
                            const visibleExactCount = allGroupOptions.length - hiddenExactCount;

                            return (
                                <div key={sourceGroup} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h5 className="text-xs font-black uppercase tracking-wide text-gray-800 dark:text-gray-100">{sourceGroup}</h5>
                                            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                                {groupHidden ? 'Group hidden' : `${visibleExactCount} visible, ${hiddenExactCount} hidden`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-responsive"
                                                onClick={() => setGroupVisible(sourceGroup, true)}
                                                disabled={!groupHidden && hiddenExactCount === 0}
                                            >
                                                <span className="btn-text">Show all</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-responsive"
                                                onClick={() => setGroupVisible(sourceGroup, false)}
                                                disabled={groupHidden}
                                            >
                                                <span className="btn-text">Hide group</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                                        {groupOptions.length > 0 ? groupOptions.map(option => {
                                            const isVisible = !groupHidden && !draftSettings.hiddenLevel3Keys.includes(option.key);
                                            return (
                                                <label
                                                    key={option.key}
                                                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${isVisible ? 'border-emerald-100 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-900/10' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50'}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isVisible}
                                                        onChange={(event) => setLevel3Visible(option.key, event.target.checked)}
                                                        disabled={groupHidden}
                                                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40"
                                                    />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">{option.label}</span>
                                                        <span className="mt-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                                            {option.rowCount} row{option.rowCount === 1 ? '' : 's'}
                                                        </span>
                                                    </span>
                                                </label>
                                            );
                                        }) : (
                                            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                No Level 3 items match the search.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            <div id="detailed-accomplishment-report-table" className="report-table-scroll">
                <table className="report-table detailed-accomplishment-table min-w-full">
                    <colgroup>
                        {columns.map(column => (
                            <col key={column.key} style={{ width: `${column.width}px` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="detailed-accomplishment-table__group detailed-accomplishment-table__group--performance" colSpan={14}>
                                PERFORMANCE INDICATOR
                            </th>
                            <th className="detailed-accomplishment-table__group detailed-accomplishment-table__group--beneficiary" colSpan={13}>
                                BENEFICIARY INFORMATION
                            </th>
                        </tr>
                        <tr>
                            {columns.map(column => (
                                <th key={column.key} className={column.numeric ? 'text-right' : ''}>
                                    {column.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.length > 0 ? displayRows.map(row => (
                            <tr key={row.id}>
                                {columns.map(column => (
                                    <td key={`${row.id}-${column.key}`} className={column.numeric ? 'text-right' : ''}>
                                        {row[column.key] || ''}
                                    </td>
                                ))}
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={columns.length} className="text-center text-gray-500 dark:text-gray-400 py-8">
                                    {quarterFilteredRows.length > 0
                                        ? 'No rows match the saved display controller and current filters.'
                                        : 'No accomplishment data found for the current filters.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DetailedAccomplishmentDataReport;
