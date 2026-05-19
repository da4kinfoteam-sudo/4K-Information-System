// Author: 4K
import React, { useState, useMemo } from 'react';
import { Subproject } from '../../constants';
import { XLSX } from '../reports/ReportUtils';

interface Props {
    subprojects: Subproject[];
}

interface InterventionStats {
    target: number;
    actual: number;
    units: Set<string>;
    allocation: number;
    obligated: number;
    disbursed: number;
}

const toTitleCase = (str: string) => {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
};

const normalizeQuantity = (qty: number, unit: string): { qty: number, unit: string } => {
    const u = (unit || '').toLowerCase().trim();
    // Convert Grams to Kilograms
    if (['g', 'gram', 'grams'].includes(u)) {
        return { qty: qty / 1000, unit: 'kg' };
    }
    // Normalize Kg variants
    if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(u)) {
        return { qty: qty, unit: 'kg' };
    }
    return { qty: qty, unit: unit || 'unspecified' };
};

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className={`agri-intervention-table__chevron ${expanded ? 'is-expanded' : ''}`} 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
    >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
);

const AgriculturalInterventionsDashboard: React.FC<Props> = ({ subprojects }) => {
    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    const data = useMemo<Record<string, Record<string, InterventionStats>>>(() => {
        // Structure: Type -> Particular (Normalized) -> Data
        const groups: Record<string, Record<string, InterventionStats>> = {};

        (subprojects || []).forEach(sp => {
            if (sp.details) {
                (sp.details || []).forEach(d => {
                    const type = d.type || 'Unspecified';
                    
                    // Normalize particular name (trim and title case to merge "Okra", "okra", "OKRA")
                    const rawParticular = d.particulars || 'Unspecified';
                    const particular = toTitleCase(rawParticular.trim());

                    const rawTarget = Number(d.numberOfUnits) || 0;
                    const rawActual = Number(d.actualNumberOfUnits) || 0;
                    const rawUnit = d.unitOfMeasure;

                    // Normalize Units (Handle g to kg conversion)
                    const targetNorm = normalizeQuantity(rawTarget, rawUnit);
                    const actualNorm = normalizeQuantity(rawActual, rawUnit);

                    const allocation = (Number(d.numberOfUnits) || 0) * (Number(d.pricePerUnit) || 0);
                    const obligated = Number(d.actualObligationAmount) || 0;
                    const disbursed = Number(d.actualDisbursementAmount) || 0;

                    if (!groups[type]) groups[type] = {};
                    if (!groups[type][particular]) groups[type][particular] = { target: 0, actual: 0, units: new Set(), allocation: 0, obligated: 0, disbursed: 0 };

                    groups[type][particular].target += targetNorm.qty;
                    groups[type][particular].actual += actualNorm.qty;
                    groups[type][particular].units.add(targetNorm.unit);
                    groups[type][particular].allocation += allocation;
                    groups[type][particular].obligated += obligated;
                    groups[type][particular].disbursed += disbursed;
                });
            }
        });

        return groups;
    }, [subprojects]);

    const filteredData = useMemo(() => {
        if (!searchTerm.trim()) return data;
        
        const filtered: Record<string, Record<string, InterventionStats>> = {};
        const term = searchTerm.toLowerCase().trim();

        Object.entries(data || {}).forEach(([type, particulars]) => {
            const matchingParticulars: Record<string, InterventionStats> = {};
            
            Object.entries(particulars || {}).forEach(([name, stats]) => {
                if (name.toLowerCase().includes(term) || type.toLowerCase().includes(term)) {
                    matchingParticulars[name] = stats;
                }
            });

            if (Object.keys(matchingParticulars).length > 0) {
                filtered[type] = matchingParticulars;
            }
        });

        return filtered;
    }, [data, searchTerm]);

    const toggleExpand = (type: string) => {
        const newSet = new Set(expandedTypes);
        if (newSet.has(type)) newSet.delete(type);
        else newSet.add(type);
        setExpandedTypes(newSet);
    };

    const typeTotals = useMemo<Record<string, { target: number, actual: number, allocation: number, obligated: number, disbursed: number }>>(() => {
        const totals: Record<string, { target: number, actual: number, allocation: number, obligated: number, disbursed: number }> = {};
        Object.keys(filteredData || {}).forEach(type => {
            let t = 0; 
            let a = 0;
            let al = 0;
            let ob = 0;
            let di = 0;
            // Explicit cast for Object.values return because TS might infer as unknown[] in some configs
            const items = Object.values((filteredData || {})[type] || {}) as InterventionStats[];
            (items || []).forEach((val) => {
                t += val.target;
                a += val.actual;
                al += val.allocation;
                ob += val.obligated;
                di += val.disbursed;
            });
            totals[type] = { target: t, actual: a, allocation: al, obligated: ob, disbursed: di };
        });
        return totals;
    }, [filteredData]);

    const grandTotals = useMemo(() => {
        let allocation = 0;
        let obligated = 0;
        let disbursed = 0;

        Object.values(filteredData || {}).forEach(particulars => {
            Object.values(particulars || {}).forEach(stats => {
                allocation += stats.allocation;
                obligated += stats.obligated;
                disbursed += stats.disbursed;
            });
        });

        return { allocation, obligated, disbursed };
    }, [filteredData]);

    // Calculate formatting for units
    const formatUnitString = (units: Set<string>) => {
        const arr = Array.from(units);
        if (arr.length === 0) return '';
        // If we have 'kg', prefer showing that cleanly if it's the only one
        if (arr.length === 1) return arr[0];
        if (arr.length > 2) return `${arr[0]} + others`;
        return arr.join('/');
    };

    const handleDownloadExcel = () => {
        const flatData: any[] = [];
        
        Object.keys(filteredData || {}).sort().forEach(type => {
            Object.entries((filteredData || {})[type] || {}).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, rawStats]) => {
                const stats = rawStats as InterventionStats;
                const deliveryRate = stats.target > 0 ? (stats.actual / stats.target) : 0;
                flatData.push({
                    'Item Type': type,
                    'Particulars': name,
                    'Unit': Array.from(stats.units).join('/'),
                    'Target Quantity': stats.target,
                    'Total Allocation': stats.allocation,
                    'Actual Delivered': stats.actual,
                    'Total Obligated': stats.obligated,
                    'Total Disbursed': stats.disbursed,
                    'Delivery Rate': deliveryRate
                });
            });
        });

        if (flatData.length === 0) {
            alert("No data to download.");
            return;
        }

        const ws = XLSX.utils.json_to_sheet(flatData);
        
        // Format percentage column (Index 8 / Column I)
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = 1; R <= range.e.r; ++R) { // Start from row 1 (skip header)
            const cellRef = XLSX.utils.encode_cell({c: 8, r: R});
            if (ws[cellRef]) {
                ws[cellRef].t = 'n';
                ws[cellRef].z = '0%';
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Interventions");
        XLSX.writeFile(wb, `Agricultural_Interventions_Breakdown_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="agri-dashboard dashboard-view animate-fadeIn">
            <section className="dashboard-section" aria-labelledby="agri-interventions-title">
            <div className="report-card agri-intervention-card">
                <div className="agri-intervention-card__header">
                    <h3 id="agri-interventions-title" className="report-card__title agri-intervention-card__title">
                        Intervention Breakdown by Item Type
                    </h3>
                    <button 
                        onClick={handleDownloadExcel}
                        className="btn btn-primary btn-responsive"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Download Excel</span>
                    </button>
                </div>

                {/* Search Bar */}
                <div className="agri-intervention-card__toolbar">
                    <div className="data-table-search-wrap agri-intervention-card__search">
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search intervention (e.g. fertilizer)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="data-table-search"
                        />
                    </div>
                </div>
                
                {/* Scrollable Container with Fixed Height */}
                <div className="data-table-scroll agri-intervention-table-wrap custom-scrollbar">
                    <div className="agri-intervention-table-viewport custom-scrollbar">
                        <table className="data-table agri-intervention-table">
                            <thead>
                                <tr>
                                    <th>Item Type / Particulars</th>
                                    <th className="data-table__numeric">Target Qty</th>
                                    <th className="data-table__numeric">Total Allocation</th>
                                    <th className="data-table__numeric">Actual Delivered</th>
                                    <th className="data-table__numeric">Total Obligated</th>
                                    <th className="data-table__numeric">Total Disbursed</th>
                                    <th className="data-table__numeric">Delivery Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.keys(filteredData).sort().map(type => {
                                    const isExpanded = expandedTypes.has(type) || searchTerm.trim() !== '';
                                    const totals = typeTotals[type] || { target: 0, actual: 0, allocation: 0, obligated: 0, disbursed: 0 };
                                    const rate = totals.target > 0 ? (totals.actual / totals.target) * 100 : 0;

                                    return (
                                        <React.Fragment key={type}>
                                            <tr 
                                                className="agri-intervention-table__group-row"
                                                onClick={() => toggleExpand(type)}
                                            >
                                                <td>
                                                    <div className="agri-intervention-table__group-label">
                                                        <ChevronIcon expanded={isExpanded} />
                                                        {type}
                                                    </div>
                                                </td>
                                                <td className="data-table__numeric agri-intervention-table__metric">
                                                    {totals.target.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="data-table__numeric agri-intervention-table__metric">
                                                    ₱{totals.allocation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="data-table__numeric agri-intervention-table__metric agri-intervention-table__metric--strong">
                                                    {totals.actual.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="data-table__numeric agri-intervention-table__metric">
                                                    ₱{totals.obligated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="data-table__numeric agri-intervention-table__metric">
                                                    ₱{totals.disbursed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td>
                                                    <div className="agri-delivery-rate">
                                                        <div className="agri-delivery-rate__track">
                                                            <div 
                                                                className={`agri-delivery-rate__bar ${rate >= 100 ? 'agri-delivery-rate__bar--complete' : ''}`} 
                                                                style={{ width: `${Math.min(rate, 100)}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className={`agri-delivery-rate__value ${rate >= 100 ? 'is-complete' : ''}`}>
                                                            {rate.toFixed(0)}%
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                            
                                            {/* Child Rows */}
                                            {isExpanded && Object.entries(filteredData[type]).sort((a,b) => a[0].localeCompare(b[0])).map(([name, rawStats]) => {
                                                const stats = rawStats as InterventionStats;
                                                const itemRate = stats.target > 0 ? (stats.actual / stats.target) * 100 : 0;
                                                const unitStr = formatUnitString(stats.units);
                                                
                                                return (
                                                    <tr key={`${type}-${name}`} className="agri-intervention-table__item-row">
                                                        <td>
                                                            <span className="agri-intervention-table__dot"></span>
                                                            {name}
                                                        </td>
                                                        <td className="data-table__numeric agri-intervention-table__metric">
                                                            <span>{stats.target.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                                                            <small>{unitStr}</small>
                                                        </td>
                                                        <td className="data-table__numeric agri-intervention-table__metric">
                                                            ₱{stats.allocation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="data-table__numeric agri-intervention-table__metric agri-intervention-table__metric--strong">
                                                            <span>{stats.actual.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                                                            <small>{unitStr}</small>
                                                        </td>
                                                        <td className="data-table__numeric agri-intervention-table__metric">
                                                            ₱{stats.obligated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="data-table__numeric agri-intervention-table__metric">
                                                            ₱{stats.disbursed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="data-table__numeric">
                                                            <span className={`agri-rate-pill ${itemRate >= 100 ? 'agri-rate-pill--complete' : ''}`}>
                                                                {itemRate.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                                {Object.keys(filteredData).length === 0 && (
                                    <tr>
                                        <td colSpan={7}>
                                            <div className="dashboard-empty dashboard-empty--center">
                                                {searchTerm ? `No results found for "${searchTerm}"` : 'No intervention data found in records.'}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {/* Grand Total Row */}
                            {Object.keys(filteredData).length > 0 && (
                                <tfoot className="agri-intervention-table__footer">
                                    <tr>
                                        <td>Grand Total</td>
                                        <td className="data-table__numeric agri-intervention-table__na">N/A</td>
                                        <td className="data-table__numeric">
                                            ₱{grandTotals.allocation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="data-table__numeric agri-intervention-table__na">N/A</td>
                                        <td className="data-table__numeric">
                                            ₱{grandTotals.obligated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="data-table__numeric">
                                            ₱{grandTotals.disbursed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="data-table__numeric agri-intervention-table__na">N/A</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
                <div className="dashboard-section__note">
                    * Items normalized by name. Grams are auto-converted to Kilograms (1000g = 1kg).
                </div>
            </div>
            </section>
        </div>
    );
};

export default AgriculturalInterventionsDashboard;
