// Author: 4K
import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { ActivityComponentType, IPO, OtherActivity, Subproject, Training } from '../../constants';
import { parseLocation } from '../LocationPicker';
import { XLSX } from './ReportUtils';

interface DetailedAccomplishmentDataReportProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        ipos: IPO[];
    };
    selectedYear: string;
    selectedOu: string;
    selectedTier: string;
    selectedFundType: string;
}

interface DetailedAccomplishmentRow {
    id: string;
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

const PSGC_API_BASE = 'https://psgc.gitlab.io/api';

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
    selectedOu,
    selectedTier,
    selectedFundType,
}) => {
    const [geocodes, setGeocodes] = useState<Record<string, string>>({});

    const ipoRegistry = useMemo(() => data.ipos || [], [data.ipos]);

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

                return {
                    id: `subproject-${subproject.id}`,
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
                    performanceIndicatorLevel3: `Subproject ${subproject.packageType || ''} delivered`.replace(/\s+/g, ' ').trim(),
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

                return {
                    id: `activity-${activity.id}`,
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
                    performanceIndicatorLevel3: `${activity.name} conducted`.replace(/\s+/g, ' ').trim(),
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

        return [...subprojectRows, ...activityRows].sort((a, b) => {
            const dateCompare = a.dateReceived.localeCompare(b.dateReceived);
            if (dateCompare !== 0) return dateCompare;
            return a.performanceIndicatorLevel3.localeCompare(b.performanceIndicatorLevel3);
        });
    }, [data.subprojects, data.trainings, data.otherActivities, ipoRegistry]);

    useEffect(() => {
        let cancelled = false;

        const loadGeocodes = async () => {
            const nextGeocodes: Record<string, string> = {};
            const uniqueLocationKeys = uniqueValues(rows.flatMap(row => row.beneficiaryLocationKeys));

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
    }, [rows]);

    const displayRows = useMemo(() => rows.map(row => ({
        ...row,
        interventionGeocode: joinUnique(row.beneficiaryLocationKeys.map(key => geocodes[key])),
    })), [rows, geocodes]);

    const handleDownload = () => {
        if (!XLSX) {
            alert('XLSX library is not available.');
            return;
        }

        const aoa = [
            ['PERFORMANCE INDICATOR', ...Array(13).fill(''), 'BENEFICIARY INFORMATION', ...Array(12).fill('')],
            columns.map(column => column.label),
            ...displayRows.map(row => columns.map(column => row[column.key] ?? '')),
        ];
        const ws: any = XLSX.utils.aoa_to_sheet(aoa);
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
            { s: { r: 0, c: 14 }, e: { r: 0, c: 26 } },
        ];
        ws['!cols'] = columns.map(column => ({ wch: Math.max(12, column.label.length + 2) }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Detailed Accomp Data');
        XLSX.writeFile(wb, `Detailed_Accomplishment_Data_${selectedYear}_${selectedOu}.xlsx`);
    };

    return (
        <div className="report-card detailed-accomplishment-report-card">
            <div className="report-card__header print-hidden">
                <div>
                    <h3 className="report-card__title">Detailed Accomplishment Data</h3>
                </div>
                <div className="report-card__actions">
                    <button onClick={handleDownload} className="btn btn-primary btn-responsive" aria-label="Download XLSX">
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Download XLSX</span>
                    </button>
                </div>
            </div>

            <div className="report-table-scroll">
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
                                    No accomplishment data found for the current filters.
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
