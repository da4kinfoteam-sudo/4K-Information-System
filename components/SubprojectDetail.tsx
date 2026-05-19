
// Author: 4K 
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { Subproject, SubprojectDetail as SubprojectDetailType, IPO, objectTypes, ObjectType, fundTypes, tiers, SubprojectCommodity, filterYears, operatingUnits, ouToRegionMap, RefCommodity, RefLivestock } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccess } from './mainfunctions/TableHooks';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { MonthYearPicker } from './ui/MonthYearPicker';
import { ObligationsEditor } from './accomplishment/ObligationsEditor';
import { DisbursementsEditor } from './accomplishment/DisbursementsEditor';
import { supabase } from '../supabaseClient';
import { ArrowLeft, CheckCircle2, Edit3, Info, Pencil, Plus, Trash2, X } from 'lucide-react';

interface SubprojectDetailProps {
    subproject: Subproject;
    ipos: IPO[];
    onBack: () => void;
    previousPageName: string;
    onUpdateSubproject: (updatedSubproject: Subproject) => void;
    particularTypes: { [key: string]: string[] };
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    commodityCategories: { [key: string]: string[] };
    refCommodities: RefCommodity[];
    refLivestock: RefLivestock[];
}

// Extended interface for local editing including completion flag
interface SubprojectDetailInput extends Omit<SubprojectDetailType, 'id'> {
    id?: number; // Optional locally until saved
    isCompleted?: boolean;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    if (dateString.includes('T')) {
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const formatMonthYear = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const getStatusBadge = (status: Subproject['status']) => {
    switch (status) {
        case 'Completed': return 'status-badge status-badge--completed';
        case 'Ongoing': return 'status-badge status-badge--ongoing';
        case 'Proposed': return 'status-badge status-badge--proposed';
        case 'Cancelled': return 'status-badge status-badge--cancelled';
        default: return 'status-badge status-badge--neutral';
    }
}

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div className="detail-item">
        <dt className="detail-label">{label}</dt>
        <dd className="detail-value font-semibold">{value || 'N/A'}</dd>
    </div>
);

const SubprojectDetail: React.FC<SubprojectDetailProps> = ({ subproject, ipos, onBack, previousPageName, onUpdateSubproject, particularTypes, uacsCodes, commodityCategories, refCommodities, refLivestock }) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('Subprojects');
    const { canEdit: canEditFinancial } = useUserAccess('Accomplishment - Financial');
    const { canEdit: canEditPhysical } = useUserAccess('Accomplishment - Physical');
    const { addIpoHistory } = useIpoHistory();
    const isAdmin = currentUser?.role === 'Administrator';

    // Edit Modes: 'full' (legacy), 'details' (exclusive), 'commodity' (exclusive), 'budget' (exclusive), 'accomplishment'
    const [editMode, setEditMode] = useState<'none' | 'full' | 'details' | 'commodity' | 'budget' | 'accomplishment'>('none');
    
    const [editedSubproject, setEditedSubproject] = useState(subproject);
    const [activeTab, setActiveTab] = useState<'details' | 'commodity' | 'budget'>('details');
    const [detailItems, setDetailItems] = useState<SubprojectDetailInput[]>([]);
    
    // Form Inputs
    const [currentDetail, setCurrentDetail] = useState({
        type: '',
        particulars: '',
        deliveryDate: '',
        unitOfMeasure: 'pcs' as SubprojectDetailType['unitOfMeasure'],
        pricePerUnit: '',
        numberOfUnits: '',
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationMonth: '',
        disbursementMonth: '',
    });
    
    const [currentCommodity, setCurrentCommodity] = useState<SubprojectCommodity>({
        typeName: '',
        name: '',
        area: 0,
        averageYield: 0
    });
    
    const [editingDetailIndex, setEditingDetailIndex] = useState<number | null>(null);
    const [confirmDeliveryDate, setConfirmDeliveryDate] = useState<{index?: number, field: string, dateStr: string} | null>(null);
    const [historyLimit, setHistoryLimit] = useState<number>(5);
    const [missingFields, setMissingFields] = useState<string[]>([]);

    const isUserRole = currentUser?.role === 'User';

    // Toggle Flags for Edit Buttons (Role Based access)
    const canEditProjectDetails = canEdit;
    const canEditCommodity = canEdit;
    const canEditBudget = canEdit;
    const canEditAccomplishment = canEdit || canEditFinancial || canEditPhysical;

    // Helper for Funding Year selection range
    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = currentYear - 5; i <= currentYear + 5; i++) {
            years.push(i);
        }
        return years;
    }, []);

    useEffect(() => {
        setEditedSubproject(subproject);
        // Map details and preserve ID for tracking, plus virtualize logic
        setDetailItems((subproject.details || []).map(d => ({
            ...d,
            obligations: (d.obligations && d.obligations.length > 0) ? d.obligations : (
                ((d.actualObligationAmount || 0) > 0) ? [{
                    id: Date.now() + Math.random(),
                    date: d.actualObligationDate || '',
                    amount: d.actualObligationAmount || 0,
                    remarks: 'Legacy Record'
                }] : []
            )
        })));
        
        if (editMode === 'details') setActiveTab('details');
        if (editMode === 'commodity') setActiveTab('commodity');
        if (editMode === 'budget') setActiveTab('budget');
        
        // Reset local editing states
        setEditingDetailIndex(null);
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: '', numberOfUnits: '', objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    }, [subproject, editMode]);

    // Calculate Project Completion Rate
    const projectCompletionStats = useMemo(() => {
        const totalItems = subproject.details.length;
        if (totalItems === 0) return { percent: 0, text: '0%' };
        
        // Count items that have an actual delivery date
        const completedItems = subproject.details.filter(d => d.actualDeliveryDate && d.actualDeliveryDate.trim() !== '').length;
        const percent = (completedItems / totalItems) * 100;
        return { percent, text: `${percent.toFixed(0)}%` };
    }, [subproject.details]);

    // Check completion status automation
    useEffect(() => {
        if (editMode !== 'none' && detailItems.length > 0) {
            const allItemsDelivered = detailItems.every((d: any) => d.actualDeliveryDate && d.actualDeliveryDate.trim() !== '');
            
            if (allItemsDelivered) {
                const latestDate = detailItems.reduce((latest: Date, current: any) => {
                    const d = new Date(current.actualDeliveryDate!);
                    return d > latest ? d : latest;
                }, new Date(0));

                if (editedSubproject.status !== 'Completed') {
                    setEditedSubproject(prev => ({
                        ...prev,
                        status: 'Completed',
                        actualCompletionDate: latestDate.toISOString().split('T')[0]
                    }));
                }
            } else {
                if (editedSubproject.status === 'Completed') {
                    setEditedSubproject(prev => ({
                        ...prev,
                        status: 'Ongoing',
                        actualCompletionDate: undefined
                    }));
                }
            }
        }
    }, [detailItems, editMode]);

    const totalBudget = useMemo(() => {
       return detailItems.reduce((acc, item) => acc + (Number(item.pricePerUnit) * Number(item.numberOfUnits)), 0);
    }, [detailItems]);

    const calculateTotalBudget = (details: SubprojectDetailType[]) => {
        return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
    }

    // Helper to get month index from YYYY-MM-DD string
    const availableUacsCodes = useMemo(() => {
        let codes: { code: string, desc: string }[] = [];
        if (currentDetail.expenseParticular) {
            const ot = currentDetail.objectType;
            const ep = currentDetail.expenseParticular;
            if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                Object.entries(uacsCodes[ot][ep]).forEach(([code, desc]) => {
                    codes.push({ code, desc: desc as string });
                });
            }
        } else {
            Object.entries(uacsCodes).forEach(([ot, eps]) => {
                Object.entries(eps).forEach(([ep, codesObj]) => {
                    Object.entries(codesObj as Record<string, string>).forEach(([code, desc]) => {
                        codes.push({ code, desc });
                    });
                });
            });
        }
        return codes;
    }, [currentDetail.expenseParticular, currentDetail.objectType]);

    const getMonthFromDateStr = (dateStr: string | undefined) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 1) return (parseInt(parts[1]) - 1).toString();
        return '';
    };

    const getYearFromDateStr = (dateStr: string | undefined) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 0) return parts[0];
        return '';
    };

    const handleConfirmDeliveryDate = () => {
        if (confirmDeliveryDate) {
            setEditedSubproject(prev => ({ ...prev, estimatedCompletionDate: confirmDeliveryDate.dateStr }));
            if (confirmDeliveryDate.index !== undefined) {
                handleDetailAccomplishmentChange(confirmDeliveryDate.index, confirmDeliveryDate.field as keyof SubprojectDetailInput, confirmDeliveryDate.dateStr);
            } else {
                setCurrentDetail(prev => ({ ...prev, [confirmDeliveryDate.field]: confirmDeliveryDate.dateStr }));
            }
            setConfirmDeliveryDate(null);
        }
    };

    const handleCancelDeliveryDate = () => {
        setConfirmDeliveryDate(null);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        if (missingFields.includes(name)) {
            setMissingFields(prev => prev.filter(f => f !== name));
        }
        
        if (name === 'status') {
            const newStatus = value as Subproject['status'];
            if (newStatus === 'Completed' && !editedSubproject.actualCompletionDate) {
                 const currentDate = new Date().toISOString().split('T')[0];
                 setEditedSubproject(prev => ({ ...prev, status: newStatus, actualCompletionDate: currentDate }));
            } else if (newStatus !== 'Completed') {
                setEditedSubproject(prev => ({ ...prev, status: newStatus, actualCompletionDate: '' }));
            } else {
                 setEditedSubproject(prev => ({ ...prev, status: newStatus }));
            }
        } else if (name === 'indigenousPeopleOrganization') {
             const selectedIpo = ipos.find(ipo => ipo.name === value);
             setEditedSubproject(prev => ({ 
                 ...prev, 
                 [name]: value,
                 location: selectedIpo ? selectedIpo.location : '' 
             }));
        } else if (name === 'fundingYear') {
            const year = parseInt(value) || new Date().getFullYear();
            setEditedSubproject(prev => {
                const newData = { ...prev, fundingYear: year, startDate: `${year}-01-01` };
                if (newData.estimatedCompletionDate) {
                    const month = getMonthFromDateStr(newData.estimatedCompletionDate);
                    if (month !== '') {
                        newData.estimatedCompletionDate = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
                    }
                }
                return newData;
            });
            
            // Sync details if fundingYear changes
            setDetailItems(prev => prev.map(d => {
                const updateDate = (dateStr?: string) => {
                    if (!dateStr) return dateStr;
                    const parts = dateStr.split('-');
                    if (parts.length > 1) return `${year}-${parts[1]}-${parts[2] || '01'}`;
                    return dateStr;
                };
                return {
                    ...d,
                    obligationMonth: updateDate(d.obligationMonth) || '',
                    disbursementMonth: updateDate(d.disbursementMonth) || '',
                    actualObligationDate: updateDate(d.actualObligationDate),
                    actualDisbursementDate: updateDate(d.actualDisbursementDate)
                };
            }));
        } else if (name === 'operatingUnit') {
            const mappedRegion = ouToRegionMap[value];
            setEditedSubproject(prev => ({
                ...prev,
                [name]: value,
                // We don't have a region field on Subproject, it's derived from IPO.
                // But we can clear the IPO if the OU changes to force them to re-select.
                indigenousPeopleOrganization: mappedRegion ? '' : prev.indigenousPeopleOrganization
            }));
        } else {
            setEditedSubproject(prev => ({ ...prev, [name]: value }));
        }
    };
    
    // New handler for top-level numeric fields (Gender/Inclusivity)
    const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setEditedSubproject(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    };

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'type') {
            setCurrentDetail(prev => ({ ...prev, type: value, particulars: '' }));
        } else if (name === 'objectType') {
            setCurrentDetail(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        } else if (name === 'expenseParticular') {
            setCurrentDetail(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        } else if (name === 'uacsCode') {
            let foundOt = currentDetail.objectType;
            let foundEp = currentDetail.expenseParticular;
            
            let isMatch = false;
            if (foundEp && uacsCodes[foundOt] && uacsCodes[foundOt][foundEp] && uacsCodes[foundOt][foundEp][value]) {
                isMatch = true;
            }

            if (!isMatch) {
                for (const ot in uacsCodes) {
                    for (const ep in uacsCodes[ot]) {
                        if (uacsCodes[ot][ep][value]) {
                            foundOt = ot as ObjectType;
                            foundEp = ep;
                            break;
                        }
                    }
                }
            }
            
            setCurrentDetail(prev => ({ ...prev, uacsCode: value, objectType: foundOt, expenseParticular: foundEp }));
        } else {
            setCurrentDetail(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleAddDetail = () => {
        if (!currentDetail.type || !currentDetail.particulars || !currentDetail.deliveryDate || !currentDetail.pricePerUnit || !currentDetail.numberOfUnits || !currentDetail.obligationMonth || !currentDetail.disbursementMonth || !currentDetail.uacsCode) {
            alert('Please fill out all detail fields, including UACS classification and monthly targets.');
            return;
        }
        
        // Removed start date validation

        const newItem: SubprojectDetailInput = {
            ...currentDetail,
            pricePerUnit: parseFloat(currentDetail.pricePerUnit),
            numberOfUnits: parseFloat(currentDetail.numberOfUnits),
            // Ensure ID is generated for new items so tracking works later
            id: Date.now() + Math.random(), 
            // Default accomplishment fields
            actualNumberOfUnits: 0,
            actualDeliveryDate: '',
            actualObligationDate: '',
            actualDisbursementDate: '',
            actualAmount: 0,
            actualObligationAmount: 0,
            actualDisbursementAmount: 0
        };

        let updatedDetailItems: SubprojectDetailInput[] = [];

        if (editingDetailIndex !== null) {
            updatedDetailItems = detailItems.map((item, index) => index === editingDetailIndex ? { ...item, ...newItem, id: item.id } : item);
            setEditingDetailIndex(null);
        } else {
            updatedDetailItems = [...detailItems, newItem];
        }

        // Rule: Automatically update Estimated Completion Date to the farthest delivery date of budget items
        let newEstimatedCompletionDate = editedSubproject.estimatedCompletionDate;
        const deliveryDates = updatedDetailItems
            .map(d => d.deliveryDate)
            .filter(d => d && d.trim() !== '')
            .map(d => new Date(d).getTime())
            .filter(t => !isNaN(t));

        if (deliveryDates.length > 0) {
            const maxDateTimestamp = Math.max(...deliveryDates);
            const farthestDate = new Date(maxDateTimestamp).toISOString().split('T')[0];
            if (!newEstimatedCompletionDate || new Date(farthestDate) > new Date(newEstimatedCompletionDate)) {
                newEstimatedCompletionDate = farthestDate;
            }
        }
        
        setDetailItems(updatedDetailItems);
        setEditedSubproject(prev => ({
            ...prev,
            estimatedCompletionDate: newEstimatedCompletionDate
        }));

        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: '', numberOfUnits: '', objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    };

    const handleRemoveDetail = (indexToRemove: number) => {
        setDetailItems(prev => prev.filter((_, index) => index !== indexToRemove));
        if (editingDetailIndex === indexToRemove) {
            handleCancelDetailEdit();
        } else if (editingDetailIndex !== null && editingDetailIndex > indexToRemove) {
            setEditingDetailIndex(editingDetailIndex - 1);
        }
    };
    
    const handleEditParticular = (indexToEdit: number) => {
        const itemToEdit = detailItems[indexToEdit];
        setCurrentDetail({
            ...itemToEdit,
            pricePerUnit: String(itemToEdit.pricePerUnit),
            numberOfUnits: String(itemToEdit.numberOfUnits),
        });
        setEditingDetailIndex(indexToEdit);
    };

    const handleCancelDetailEdit = () => {
        setEditingDetailIndex(null);
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: '', numberOfUnits: '', objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    };

    const handleDetailAccomplishmentChange = (index: number, field: keyof SubprojectDetailInput, value: any) => {
        setDetailItems(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
    };

    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'typeName') {
            setCurrentCommodity(prev => ({ ...prev, typeName: value, name: '', area: 0, averageYield: 0 }));
        } else if (name === 'name') {
            const selectedName = value;
            let yieldVal = 0;
            if (currentCommodity.typeName === 'Crop') {
                const ref = refCommodities.find(c => c.name === selectedName);
                if (ref) {
                    yieldVal = (ref.target_yield_ha || 0) * (currentCommodity.area || 0);
                }
            }
            setCurrentCommodity(prev => ({ ...prev, name: selectedName, averageYield: yieldVal }));
        } else if (name === 'area') {
            const areaVal = Number(value);
            let yieldVal = currentCommodity.averageYield || 0;
            if (currentCommodity.typeName === 'Crop') {
                const ref = refCommodities.find(c => c.name === currentCommodity.name);
                if (ref) {
                    yieldVal = (ref.target_yield_ha || 0) * areaVal;
                }
            }
            setCurrentCommodity(prev => ({ ...prev, area: areaVal, averageYield: yieldVal }));
        } else {
            setCurrentCommodity(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddCommodity = () => {
        const isLivestock = currentCommodity.typeName === 'Livestock';
        const isCrop = currentCommodity.typeName === 'Crop';
        
        if (!currentCommodity.typeName || !currentCommodity.name || !currentCommodity.area || (isCrop && !currentCommodity.averageYield)) {
            alert(`Please fill in all commodity fields (Type, Name, ${isLivestock ? 'Number of Heads' : 'Area, Yield'}).`);
            return;
        }
        const newCommodity: SubprojectCommodity = {
            ...currentCommodity,
            area: Number(currentCommodity.area),
            averageYield: isLivestock ? undefined : Number(currentCommodity.averageYield)
        };
        setEditedSubproject(prev => ({
            ...prev,
            subprojectCommodities: [...(prev.subprojectCommodities || []), newCommodity]
        }));
        setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
    };

    const handleEditCommodity = (index: number) => {
        const commodityToEdit = editedSubproject.subprojectCommodities?.[index];
        if (commodityToEdit) {
            setCurrentCommodity({
                typeName: commodityToEdit.typeName || '',
                name: commodityToEdit.name,
                area: commodityToEdit.area,
                averageYield: commodityToEdit.averageYield || 0
            });
            setEditedSubproject(prev => ({
                ...prev,
                subprojectCommodities: (prev.subprojectCommodities || []).filter((_, i) => i !== index)
            }));
        }
    };

    const handleRemoveCommodity = (index: number) => {
        setEditedSubproject(prev => ({
            ...prev,
            subprojectCommodities: (prev.subprojectCommodities || []).filter((_, i) => i !== index)
        }));
    };

    const handleCommodityAccomplishmentChange = (index: number, field: keyof SubprojectCommodity, value: any) => {
        if (field === 'marketingPercentage' || field === 'foodSecurityPercentage') {
            const numValue = parseFloat(value);
            if (value !== '' && (isNaN(numValue) || numValue < 0)) return; 
            const newValue = value === '' ? 0 : numValue;
            const currentItem = editedSubproject.subprojectCommodities?.[index];
            if (currentItem) {
                const otherKey = field === 'marketingPercentage' ? 'foodSecurityPercentage' : 'marketingPercentage';
                const otherValue = parseFloat(String(currentItem[otherKey]) || '0');
                if (newValue + otherValue > 100) return;
            }
        }
        setEditedSubproject(prev => ({
            ...prev,
            subprojectCommodities: prev.subprojectCommodities?.map((c, i) => i === index ? { ...c, [field]: value } : c)
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        
        if (editMode === 'details') {
            const requiredFields = ['name', 'indigenousPeopleOrganization', 'status'];
            const missing = requiredFields.filter(field => !editedSubproject[field as keyof Subproject]);
            
            if (missing.length > 0) {
                setMissingFields(missing);
                alert("Please fill in all required fields marked with an asterisk (*).");
                return;
            }
        }
        
        let eventType = "Updated via Detail View";
        if (editMode === 'details') eventType = "Updated Details";
        if (editMode === 'commodity') eventType = "Updated Commodities";
        if (editMode === 'budget') eventType = "Updated Budget";
        if (editMode === 'accomplishment') eventType = "Updated Accomplishment";

        if (editedSubproject.status === 'Completed' && subproject.status !== 'Completed') {
            eventType = "Subproject Completed";
        }

        const historyEntry = {
            date: new Date().toISOString(),
            event: eventType,
            user: currentUser?.fullName || "System"
        };
        
        let resolvedIpoId = editedSubproject.ipo_id;
        if (!resolvedIpoId && editedSubproject.indigenousPeopleOrganization) {
            const matchedIpo = ipos.find(i => i.name === editedSubproject.indigenousPeopleOrganization);
            if (matchedIpo) resolvedIpoId = matchedIpo.id;
        }

        if (resolvedIpoId) {
             addIpoHistory(resolvedIpoId, `${eventType}: ${editedSubproject.name}`);
        }

        // Logic to track accomplishment history in new table
        if (editMode === 'accomplishment' && supabase) {
            // Find changed items that are newly delivered or quantity changed
            const changes = detailItems.filter((item, index) => {
                const original = subproject.details[index];
                if (!original) return true; // New item (shouldn't happen in accomplishment mode usually)
                
                // Track if actual delivery happened or quantity updated
                const deliveredNow = !!item.actualDeliveryDate;
                const deliveredBefore = !!original.actualDeliveryDate;
                
                // If just marked delivered, or quantity updated
                if ((deliveredNow && !deliveredBefore) || (deliveredNow && item.actualNumberOfUnits !== original.actualNumberOfUnits)) {
                    return true;
                }
                return false;
            });

            if (changes.length > 0) {
                const historyRecords = changes.map(item => ({
                    subproject_id: subproject.id,
                    detail_id: item.id || 0, // Fallback 0 if id missing (should not happen for saved items)
                    delivery_date: item.actualDeliveryDate,
                    quantity: item.actualNumberOfUnits,
                    remarks: `Delivered: ${item.particulars}`,
                    created_by: currentUser?.fullName || 'System',
                    created_at: new Date().toISOString()
                }));
                
                // Insert into tracking table
                const { error: histError } = await supabase.from('subproject_accomplishments').insert(historyRecords);
                if (histError) console.error("Error logging accomplishment history:", histError);
            }
        }

        // Add 'id' back to details if missing (from new adds)
        const cleanDetails = detailItems.map((d, i) => {
            const cleanD = { 
                ...d, 
                id: d.id || (Date.now() + i) // Ensure ID
            };
            if (cleanD.deliveryDate === '') (cleanD as any).deliveryDate = null;
            if (cleanD.actualDeliveryDate === '') (cleanD as any).actualDeliveryDate = null;
            if (cleanD.obligationMonth === '') (cleanD as any).obligationMonth = null;
            if (cleanD.disbursementMonth === '') (cleanD as any).disbursementMonth = null;
            if (cleanD.obligations && cleanD.obligations.length === 0) {
                 cleanD.actualObligationAmount = 0;
                 cleanD.actualObligationDate = undefined;
            } else if (cleanD.obligations && cleanD.obligations.length > 0) {
                 const latestOb = [...cleanD.obligations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                 cleanD.actualObligationAmount = cleanD.obligations.reduce((sum, o) => sum + (o.amount || 0), 0);
                 cleanD.actualObligationDate = latestOb.date;
            }
            if (cleanD.disbursements && cleanD.disbursements.length === 0) {
                 cleanD.actualDisbursementAmount = 0;
                 cleanD.actualDisbursementDate = undefined;
            } else if (cleanD.disbursements && cleanD.disbursements.length > 0) {
                 const latestDb = [...cleanD.disbursements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                 cleanD.actualDisbursementAmount = cleanD.disbursements.reduce((sum, d) => sum + (d.amount || 0), 0);
                 cleanD.actualDisbursementDate = latestDb.date;
            }
            return cleanD;
        });

        const updatedSubprojectWithDetails = {
            ...editedSubproject,
            ipo_id: resolvedIpoId,
            details: cleanDetails as SubprojectDetailType[],
            history: [...(subproject.history || []), historyEntry]
        };
        
        const dateFields = ['startDate', 'estimatedCompletionDate', 'actualCompletionDate'];
        dateFields.forEach(field => {
            if (updatedSubprojectWithDetails[field as keyof Subproject] === '') {
                (updatedSubprojectWithDetails as any)[field] = null;
            }
        });

        onUpdateSubproject(updatedSubprojectWithDetails);
        
        // Sync obligations to central table if supabase is available
        if (supabase) {
             syncSubprojectObligations(subproject.id, cleanDetails);
             syncSubprojectDisbursements(subproject.id, cleanDetails);
        }
        
        setEditMode('none');
    };

    const syncSubprojectObligations = async (parentId: number, details: SubprojectDetailType[]) => {
        if (!supabase) return;
        const entityType = 'subproject_detail';
        
        // Delete all for this parent first
        await supabase.from('financial_obligations')
            .delete()
            .eq('entity_type', entityType)
            .eq('parent_id', parentId);
        
        // Insert all from all detail items
        const syncPayload: any[] = [];
        details.forEach(item => {
            if (item.obligations && item.obligations.length > 0) {
                // Update legacy fields for fallback reporting
                const latestOb = [...item.obligations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                item.actualObligationAmount = item.obligations.reduce((sum, o) => sum + (o.amount || 0), 0);
                item.actualObligationDate = latestOb.date;

                item.obligations.forEach(o => {
                    syncPayload.push({
                        entity_type: entityType,
                        parent_id: parentId,
                        item_id: item.id?.toString() || null,
                        obligation_date: o.date,
                        amount: o.amount || 0,
                        remarks: o.remarks || ''
                    });
                });
            }
        });

        if (syncPayload.length > 0) {
            await supabase.from('financial_obligations').insert(syncPayload);
        }
    };

    const syncSubprojectDisbursements = async (parentId: number, details: SubprojectDetailType[]) => {
        if (!supabase) return;
        const entityType = 'subproject_detail';
        
        await supabase.from('financial_disbursements').delete().eq('entity_type', entityType).eq('parent_id', parentId);
        
        const syncPayload: any[] = [];
        details.forEach(item => {
            if (item.disbursements && item.disbursements.length > 0) {
                const latestDb = [...item.disbursements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                item.actualDisbursementAmount = item.disbursements.reduce((sum, d) => sum + (d.amount || 0), 0);
                item.actualDisbursementDate = latestDb.date;

                item.disbursements.forEach(d => {
                    syncPayload.push({
                        entity_type: entityType,
                        parent_id: parentId,
                        item_id: item.id?.toString() || null,
                        disbursement_date: d.date,
                        amount: d.amount || 0,
                        remarks: d.remarks || ''
                    });
                });
            } else if (item.actualDisbursementAmount && item.actualDisbursementAmount > 0) {
                 syncPayload.push({
                     entity_type: entityType,
                     parent_id: parentId,
                     item_id: item.id?.toString() || null,
                     disbursement_date: item.actualDisbursementDate || new Date().toISOString().split('T')[0],
                     amount: item.actualDisbursementAmount || 0,
                     remarks: 'Migrated missing'
                 });
            }
        });

        if (syncPayload.length > 0) {
            await supabase.from('financial_disbursements').insert(syncPayload);
        }
    };

    const commonInputClasses = "form-control";

    if (editMode !== 'none') {
        return (
            <div className="form-page animate-fadeIn">
                <div className="detail-header">
                    <h1 className="detail-title">
                        {editMode === 'budget' ? 'Editing Budget: ' : editMode === 'accomplishment' ? 'Editing Accomplishment: ' : editMode === 'commodity' ? 'Editing Commodities: ' : 'Editing Details: '}{subproject.name}
                    </h1>
                    <button onClick={() => setEditMode('none')} className="btn btn-secondary"><X className="btn-symbol" aria-hidden="true" />Cancel Editing</button>
                </div>
                
                <div className="form-card">
                    <form onSubmit={handleSubmit}>
                        <div className="min-h-[400px]">
                            {/* DETAILS EDIT MODE */}
                            {editMode === 'details' && (
                                <div className="space-y-6">
                                    <fieldset className="form-section">
                                        <legend>Project Details</legend>
                                        <div className="form-grid">
                                            <div>
                                                <label className="form-label">Subproject Name <span className="text-red-500">*</span></label>
                                                <input type="text" name="name" value={editedSubproject.name} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('name') ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
                                            </div>
                                            <div>
                                                <label className="form-label">Operating Unit</label>
                                                <select 
                                                    name="operatingUnit" 
                                                    value={editedSubproject.operatingUnit || ''} 
                                                    onChange={handleInputChange} 
                                                    className={commonInputClasses} 
                                                    disabled={currentUser?.role !== 'Administrator'}
                                                    title={currentUser?.role !== 'Administrator' ? "Only Administrators can edit the Operating Unit" : ""}
                                                >
                                                    <option value="">Select Operating Unit</option>
                                                    {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">IPO <span className="text-red-500">*</span></label>
                                                <select name="indigenousPeopleOrganization" value={editedSubproject.indigenousPeopleOrganization} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('indigenousPeopleOrganization') ? 'border-red-500 ring-1 ring-red-500' : ''}`}>
                                                    <option value="">Select IPO</option>
                                                    {ipos.map(ipo => <option key={ipo.id} value={ipo.name}>{ipo.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">Status <span className="text-red-500">*</span></label>
                                                <select name="status" value={editedSubproject.status} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('status') ? 'border-red-500 ring-1 ring-red-500' : ''}`}>
                                                    <option value="Proposed">Proposed</option>
                                                    <option value="Ongoing">Ongoing</option>
                                                    {(isAdmin || editedSubproject.status === 'Completed') && <option value="Completed">Completed</option>}
                                                    <option value="Cancelled">Cancelled</option>
                                                </select>
                                            </div>
                                            <div>
                                                 <label className="form-label">Package</label>
                                                 <select name="packageType" value={editedSubproject.packageType} onChange={handleInputChange} className={commonInputClasses}>
                                                    {Array.from({ length: 7 }, (_, i) => `Package ${i + 1}`).map(p => <option key={p} value={p}>{p}</option>)}
                                                 </select>
                                            </div>
                                        </div>
                                    </fieldset>
                                     <fieldset className="form-section">
                                        <legend>Location & Timeline</legend>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="form-label">Location</label>
                                                <input 
                                                    type="text" 
                                                    value={editedSubproject.location} 
                                                    readOnly 
                                                    className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} 
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="form-label">Estimated Completion</label>
                                                    <MonthYearPicker
                                                        value={editedSubproject.estimatedCompletionDate}
                                                        onChange={(val) => {
                                                            setEditedSubproject(prev => ({ ...prev, estimatedCompletionDate: val }));
                                                            if (!currentDetail.deliveryDate) {
                                                                setCurrentDetail(prev => ({ ...prev, deliveryDate: val }));
                                                            }
                                                        }}
                                                        placeholder="Select month"
                                                        defaultYear={editedSubproject.fundingYear}
                                                        className="h-10"
                                                    />
                                                    {getYearFromDateStr(editedSubproject.estimatedCompletionDate) && parseInt(getYearFromDateStr(editedSubproject.estimatedCompletionDate)) !== editedSubproject.fundingYear && (
                                                        <p className="text-xs text-amber-600 mt-1">Note: Estimated completion year is different from the funding year.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </fieldset>
                                    <fieldset className="form-section">
                                        <legend>Funding</legend>
                                        <div className="form-grid">
                                            <div>
                                                <label className="form-label">Year</label>
                                                <select name="fundingYear" value={editedSubproject.fundingYear} onChange={handleInputChange} className={commonInputClasses}>
                                                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">Type</label>
                                                <select name="fundType" value={editedSubproject.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                                    {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">Tier</label>
                                                <select name="tier" value={editedSubproject.tier} onChange={handleInputChange} className={commonInputClasses}>
                                                    {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </fieldset>
                                    <fieldset className="form-section">
                                        <legend>Remarks</legend>
                                        <div>
                                            <textarea name="remarks" id="remarks" value={editedSubproject.remarks} onChange={handleInputChange} rows={4} className={commonInputClasses} />
                                        </div>
                                    </fieldset>
                                 </div>
                            )}

                            {/* COMMODITY EDIT MODE */}
                            {editMode === 'commodity' && (
                                <div className="space-y-6">
                                    <fieldset className="form-section">
                                        <legend>Subproject Commodities</legend>
                                        <div className="commodity-edit-list">
                                            {editedSubproject.subprojectCommodities && editedSubproject.subprojectCommodities.length > 0 ? (
                                                editedSubproject.subprojectCommodities.map((c, index) => (
                                                    <div key={index} className="commodity-edit-card">
                                                        <div className="commodity-edit-card__summary">
                                                            <div className="commodity-edit-card__header">
                                                                <span className="commodity-edit-card__title">{c.name}</span>
                                                                <span className="status-badge status-badge--completed status-badge--compact">{c.typeName}</span>
                                                            </div>
                                                            <div className="commodity-edit-metrics">
                                                                <div>
                                                                    <span className="commodity-edit-label">{c.typeName === 'Livestock' ? 'Number of Heads' : 'Total Area'}</span>
                                                                    <span className="commodity-edit-value">{c.area} {c.typeName === 'Livestock' ? 'Heads' : 'Hectares'}</span>
                                                                </div>
                                                                {c.typeName === 'Crop' && (
                                                                    <div>
                                                                        <span className="commodity-edit-label">Estimated Yield</span>
                                                                        <span className="commodity-edit-value">{c.averageYield?.toLocaleString()} Kilograms</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="commodity-edit-card__actions">
                                                            <button type="button" onClick={() => handleEditCommodity(index)} className="table-action table-action--primary" title="Edit commodity">
                                                                <Pencil className="btn-symbol" aria-hidden="true" />
                                                            </button>
                                                            <button type="button" onClick={() => handleRemoveCommodity(index)} className="table-action table-action--danger" title="Remove commodity">
                                                                <Trash2 className="btn-symbol" aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="detail-empty">No commodities added yet. Use the form below to add one.</p>
                                            )}
                                        </div>

                                        <div className="commodity-edit-form">
                                            <h4 className="commodity-edit-form__title">
                                                <span className="commodity-edit-form__marker"></span>
                                                Add New Commodity
                                            </h4>
                                            <div className="form-grid">
                                                <div>
                                                    <label className="form-label">Commodity Type</label>
                                                    <select 
                                                        name="typeName" 
                                                        value={currentCommodity.typeName} 
                                                        onChange={handleCommodityChange} 
                                                        className={commonInputClasses}
                                                    >
                                                        <option value="">Select Type</option>
                                                        <option value="Crop">Crop</option>
                                                        <option value="Livestock">Livestock</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="form-label">Commodity Name</label>
                                                    <select 
                                                        name="name" 
                                                        value={currentCommodity.name} 
                                                        onChange={handleCommodityChange} 
                                                        disabled={!currentCommodity.typeName} 
                                                        className={commonInputClasses}
                                                    >
                                                        <option value="">Select Commodity</option>
                                                        {currentCommodity.typeName === 'Crop' && refCommodities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                        {currentCommodity.typeName === 'Livestock' && refLivestock.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="form-label">
                                                        {currentCommodity.typeName === 'Livestock' ? 'Number of Heads' : 'Total Area (Hectares)'}
                                                    </label>
                                                    <input 
                                                        type="number" 
                                                        name="area" 
                                                        value={currentCommodity.area} 
                                                        onChange={handleCommodityChange} 
                                                        className={commonInputClasses} 
                                                        placeholder={currentCommodity.typeName === 'Livestock' ? "Enter number of heads" : "Enter hectares"}
                                                    />
                                                </div>
                                            </div>

                                            {currentCommodity.name && (
                                                <div className="commodity-reference animate-fadeIn">
                                                    <h5 className="commodity-reference__title">
                                                        <Info className="h-3 w-3" />
                                                        Reference Information
                                                    </h5>
                                                    {currentCommodity.typeName === 'Crop' ? (
                                                        (() => {
                                                            const ref = refCommodities.find(c => c.name === currentCommodity.name);
                                                            if (!ref) return null;
                                                            return (
                                                                <div className="commodity-reference__grid">
                                                                    <div>
                                                                        <span className="commodity-edit-label">Banner Program</span>
                                                                        <span className="commodity-edit-value">{ref.banner_program}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Commodity Group</span>
                                                                        <span className="commodity-edit-value">{ref.commodity_group}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Elevation Range</span>
                                                                        <span className="commodity-edit-value">{ref.min_elevation_masl} - {ref.max_elevation_masl} MASL</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Target Yield</span>
                                                                        <span className="commodity-edit-value">{ref.target_yield_ha?.toLocaleString()} Kilograms/Hectares</span>
                                                                    </div>
                                                                    <div className="commodity-reference__full">
                                                                        <div className="commodity-reference__inline">
                                                                            <div>
                                                                                <span className="commodity-edit-label">Recommended Soil</span>
                                                                                <span className="commodity-edit-value">{ref.recommended_soil}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="commodity-edit-label">Climate Type</span>
                                                                                <span className="commodity-edit-value">{ref.climate_type_suitability}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()
                                                    ) : (
                                                        (() => {
                                                            const ref = refLivestock.find(c => c.name === currentCommodity.name);
                                                            if (!ref) return null;
                                                            return (
                                                                <div className="commodity-reference__grid">
                                                                    <div>
                                                                        <span className="commodity-edit-label">Category</span>
                                                                        <span className="commodity-edit-value">{ref.category}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Housing Type</span>
                                                                        <span className="commodity-edit-value">{ref.housing_type}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Feed Type</span>
                                                                        <span className="commodity-edit-value">{ref.feed_type}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Water Requirement</span>
                                                                        <span className="commodity-edit-value">{ref.water_requirement_liters_day} Liters/Day</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()
                                                    )}
                                                </div>
                                            )}

                                            <div className="commodity-edit-footer">
                                                {currentCommodity.typeName === 'Crop' && (
                                                    <div className="commodity-edit-yield">
                                                        <label className="form-label">Auto-Computed Yield (Kilograms)</label>
                                                        <div className="relative">
                                                            <input 
                                                                type="number" 
                                                                name="averageYield" 
                                                                value={currentCommodity.averageYield} 
                                                                readOnly
                                                                className={`${commonInputClasses} commodity-edit-yield__input`} 
                                                            />
                                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                                <span className="commodity-edit-yield__unit">KG</span>
                                                            </div>
                                                        </div>
                                                        <p className="commodity-edit-note">Calculated based on area and reference target yield.</p>
                                                    </div>
                                                )}
                                                <div className="commodity-edit-footer__actions">
                                                    <button 
                                                        type="button" 
                                                        onClick={handleAddCommodity} 
                                                        className="btn btn-primary"
                                                    >
                                                        Add to List
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </fieldset>
                                </div>
                            )}

                            {/* BUDGET EDIT MODE */}
                            {editMode === 'budget' && (
                                <div className="space-y-6">
                                     <fieldset className="form-section">
                                        <legend>Budget Items</legend>
                                        <div className="budget-item-list">
                                            {detailItems.map((d, index) => (
                                                <div key={index} className={`budget-item-card ${editingDetailIndex === index ? 'budget-item-card--editing' : ''}`}>
                                                    <div className="budget-item-card__summary">
                                                        <span className="budget-item-card__title">{d.particulars}</span>
                                                        <div className="budget-item-card__meta">
                                                            <div>{d.uacsCode} {availableUacsCodes.find(c => c.code === d.uacsCode)?.desc ? `- ${availableUacsCodes.find(c => c.code === d.uacsCode)?.desc}` : ''}</div>
                                                            <div>{d.numberOfUnits} {d.unitOfMeasure} @ {formatCurrency(Number(d.pricePerUnit))}</div>
                                                            <span className="block mt-1">Obligation: {formatMonthYear(d.obligationMonth)} | Disbursement: {formatMonthYear(d.disbursementMonth)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="budget-item-card__actions">
                                                        <span className="budget-item-card__total">{formatCurrency(Number(d.numberOfUnits) * Number(d.pricePerUnit))}</span>
                                                        <div className="budget-item-card__buttons">
                                                            <button type="button" onClick={() => handleEditParticular(index)} className="table-action table-action--primary" title="Edit item">
                                                                <Pencil className="btn-symbol" aria-hidden="true" />
                                                            </button>
                                                            <button type="button" onClick={() => handleRemoveDetail(index)} className="table-action table-action--danger" title="Remove item"><Trash2 className="btn-symbol" aria-hidden="true" /></button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="budget-item-list__total">Total: {formatCurrency(totalBudget)}</div>
                                        </div>

                                        <div className="budget-item-form-grid">
                                            <div className="budget-item-form-grid__wide"><label className="form-label">Item Type</label><select name="type" value={currentDetail.type} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`}><option value="">Select Type</option>{Object.keys(particularTypes).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                            <div className="budget-item-form-grid__wide"><label className="form-label">Particulars</label><select name="particulars" value={currentDetail.particulars} onChange={handleDetailChange} disabled={!currentDetail.type} className={`${commonInputClasses} form-control--compact`}><option value="">Select Item</option>{currentDetail.type && particularTypes[currentDetail.type]?.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                                            
                                            <div className="budget-item-form-grid__full budget-item-form-grid budget-item-form-grid--nested">
                                                <div><label className="form-label">Object Type</label><select name="objectType" value={currentDetail.objectType} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                                <div><label className="form-label">Expense Particular</label><select name="expenseParticular" value={currentDetail.expenseParticular} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`}><option value="">Select Particular</option>{Object.keys(uacsCodes[currentDetail.objectType] || {}).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                                <div>
                                                    <label className="form-label">UACS Code</label>
                                                    <input 
                                                        type="text"
                                                        name="uacsCode" 
                                                        value={currentDetail.uacsCode} 
                                                        onChange={handleDetailChange} 
                                                        list="uacs-codes-list"
                                                        placeholder="Search UACS..."
                                                        className={`${commonInputClasses} form-control--compact`}
                                                    />
                                                    <datalist id="uacs-codes-list">
                                                        {availableUacsCodes.map((item) => (
                                                            <option key={item.code} value={item.code}>{item.code} - {item.desc}</option>
                                                        ))}
                                                    </datalist>
                                                    {currentDetail.uacsCode && availableUacsCodes.find(c => c.code === currentDetail.uacsCode) && (
                                                        <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                                                            {availableUacsCodes.find(c => c.code === currentDetail.uacsCode)?.desc}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="form-label">Delivery Month</label>
                                                <MonthYearPicker
                                                    value={currentDetail.deliveryDate}
                                                    onChange={(val) => {
                                                        if (editedSubproject.estimatedCompletionDate && val > editedSubproject.estimatedCompletionDate) {
                                                            setConfirmDeliveryDate({ field: 'deliveryDate', dateStr: val });
                                                            return;
                                                        }
                                                        setCurrentDetail(prev => ({ ...prev, deliveryDate: val }));
                                                    }}
                                                    placeholder="Select month"
                                                    defaultYear={editedSubproject.fundingYear}
                                                    className="h-9"
                                                />
                                            </div>
                                            
                                            <div>
                                                <label className="form-label">Obligation Month</label>
                                                <MonthYearPicker
                                                    value={currentDetail.obligationMonth}
                                                    onChange={(val) => setCurrentDetail(prev => ({ ...prev, obligationMonth: val }))}
                                                    placeholder="Select month"
                                                    defaultYear={editedSubproject.fundingYear}
                                                    className="h-9"
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">Disbursement Month</label>
                                                <MonthYearPicker
                                                    value={currentDetail.disbursementMonth}
                                                    onChange={(val) => setCurrentDetail(prev => ({ ...prev, disbursementMonth: val }))}
                                                    placeholder="Select month"
                                                    defaultYear={editedSubproject.fundingYear}
                                                    className="h-9"
                                                />
                                            </div>

                                            <div><label className="form-label">Price/Unit</label><input type="number" name="pricePerUnit" value={currentDetail.pricePerUnit} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`} /></div>
                                            <div><label className="form-label">Number of Units</label><input type="number" name="numberOfUnits" value={currentDetail.numberOfUnits} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`} /></div>
                                            <div><label className="form-label">Unit of Measure</label><select name="unitOfMeasure" value={currentDetail.unitOfMeasure} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`}><option value="pcs">pcs</option><option value="grams">grams</option><option value="kg">kg</option><option value="liters">liters</option><option value="boxes">boxes</option><option value="cans">cans</option><option value="sets">sets</option><option value="pax">pax</option><option value="heads">heads</option><option value="months">months</option><option value="days">days</option><option value="ha">ha</option><option value="bags">bags</option><option value="bottles">bottles</option><option value="sachets">sachets</option><option value="rolls">rolls</option><option value="meters">meters</option><option value="units">units</option><option value="packs">packs</option><option value="lots">lots</option></select></div>
                                            
                                            {editingDetailIndex !== null ? (
                                                <div className="budget-item-form-grid__actions">
                                                    <button type="button" onClick={handleAddDetail} className="btn btn-primary">Update Item</button>
                                                    <button type="button" onClick={handleCancelDetailEdit} className="btn btn-secondary">Cancel</button>
                                                </div>
                                            ) : (
                                                <div className="budget-item-form-grid__actions">
                                                    <button type="button" onClick={handleAddDetail} className="btn btn-primary w-full">
                                                        <Plus className="btn-symbol" aria-hidden="true" />
                                                        Add Item
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                     </fieldset>
                                </div>
                            )}
                            
                            {/* ACCOMPLISHMENT EDIT MODE */}
                            {editMode === 'accomplishment' && (
                                <div className="space-y-6">
                                    <fieldset className="form-section">
                                        <legend>Budget Items Accomplishment</legend>
                                        <div className="data-table-scroll">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-medium">Completed</th>
                                                        <th className="px-3 py-2 text-left font-medium">Particulars</th>
                                                        <th className="px-3 py-2 text-left font-medium">Actual Units</th>
                                                        <th className="px-3 py-2 text-left font-medium">Actual Delivery</th>
                                                        <th className="px-3 py-2 text-left font-medium" colSpan={2}>Obligation</th>
                                                        <th className="px-3 py-2 text-left font-medium" colSpan={2}>Disbursement</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                    {detailItems.map((detail, idx) => {
                                                        const originalDetail = subproject.details.find(d => d.id === detail.id);
                                                        const wasCompleted = originalDetail?.isCompleted || false;
                                                        const hasDeliveryDate = !!detail.actualDeliveryDate;
                                                        
                                                        // Checkbox disabled if no delivery date
                                                        const isCheckboxDisabled = !hasDeliveryDate;

                                                        return (
                                                            <tr key={idx} className={wasCompleted ? 'bg-gray-100 dark:bg-gray-700/50 opacity-75' : ''}>
                                                                <td className="px-3 py-2 text-center">
                                                                    <input 
                                                                        type="checkbox"
                                                                        checked={detail.isCompleted || false}
                                                                        onChange={(e) => handleDetailAccomplishmentChange(idx, 'isCompleted', e.target.checked)}
                                                                        disabled={isCheckboxDisabled} // Only clickable if date exists and not already locked (unless admin)
                                                                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    />
                                                                </td>
                                                                <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200">
                                                                    {detail.particulars}
                                                                    <div className="text-xs text-gray-500">Target: {detail.numberOfUnits} {detail.unitOfMeasure}</div>
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <input 
                                                                        type="number" 
                                                                        value={(detail as any).actualNumberOfUnits || ''} 
                                                                        onChange={(e) => handleDetailAccomplishmentChange(idx, 'actualNumberOfUnits', parseFloat(e.target.value))} 
                                                                        className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500 disabled:bg-gray-100 disabled:dark:bg-gray-800" 
                                                                        placeholder={`0 ${detail.unitOfMeasure}`}
                                                                    />
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <MonthYearPicker
                                                                        value={(detail as any).actualDeliveryDate}
                                                                        onChange={(val) => handleDetailAccomplishmentChange(idx, 'actualDeliveryDate', val)}
                                                                        placeholder="Select month"
                                                                        defaultYear={editedSubproject.fundingYear}
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </td>
                                                                <td className="px-3 py-2" colSpan={2}>
                                                                    <ObligationsEditor 
                                                                        obligations={detail.obligations || []}
                                                                        onChange={(newObs, total) => {
                                                                            handleDetailAccomplishmentChange(idx, 'obligations', newObs);
                                                                            handleDetailAccomplishmentChange(idx, 'actualObligationAmount', total);
                                                                        }}
                                                                        defaultYear={editedSubproject.fundingYear}
                                                                    />
                                                                </td>
                                                                <td className="px-3 py-2" colSpan={2}>
                                                                    <DisbursementsEditor
                                                                        disbursements={detail.disbursements || []}
                                                                        onChange={(newDb, total) => {
                                                                            handleDetailAccomplishmentChange(idx, 'disbursements', newDb);
                                                                            handleDetailAccomplishmentChange(idx, 'actualDisbursementAmount', total);
                                                                        }}
                                                                        defaultYear={editedSubproject.fundingYear}
                                                                    />
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </fieldset>

                                    {/* Section 2: Customer Satisfaction */}
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Customer Satisfaction</legend>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">Placeholder for Customer Satisfaction Survey data.</p>
                                    </fieldset>

                                    {/* Section 3: Gender and Inclusivity (Added) */}
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Gender and Inclusivity</legend>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">PWD</label>
                                                <input type="number" name="actualPWD" value={editedSubproject.actualPWD || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Muslim</label>
                                                <input type="number" name="actualMuslim" value={editedSubproject.actualMuslim || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">LGBTQ+</label>
                                                <input type="number" name="actualLGBTQ" value={editedSubproject.actualLGBTQ || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Solo Parents</label>
                                                <input type="number" name="actualSoloParent" value={editedSubproject.actualSoloParent || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Senior</label>
                                                <input type="number" name="actualSenior" value={editedSubproject.actualSenior || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Youth</label>
                                                <input type="number" name="actualYouth" value={editedSubproject.actualYouth || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                        </div>
                                    </fieldset>

                                    {/* Section 4: Outcome of Subproject */}
                                    <fieldset className="form-fieldset">
                                        <legend className="form-legend">Outcome of Subproject</legend>
                                        <div className="outcome-edit-list">
                                            {editedSubproject.subprojectCommodities?.map((commodity, index) => {
                                                const isCrop = commodity.typeName === 'Crop';
                                                return (
                                                    <div key={index} className="outcome-edit-card">
                                                        <div className="outcome-edit-card__meta">
                                                            <span className="outcome-edit-card__label">Commodity</span>
                                                            <strong>{commodity.name}</strong>
                                                            <span>{commodity.typeName}</span>
                                                        </div>
                                                        <div className="outcome-edit-card__meta">
                                                            <span className="outcome-edit-card__label">Target</span>
                                                            <strong>{commodity.averageYield || '-'}</strong>
                                                            <span>{isCrop ? (commodity.averageYield ? 'Yield Kg/Ha' : '') : 'Heads'}</span>
                                                        </div>
                                                        <div className="outcome-edit-card__field">
                                                            <label className="form-label">Actual</label>
                                                            <div className="outcome-edit-inline">
                                                                <input type="number" value={commodity.actualYield || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'actualYield', parseFloat(e.target.value))} className={`${commonInputClasses} form-control--compact`} placeholder="0" />
                                                                <span>{isCrop ? 'Yield Kg/Ha' : 'Heads'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="outcome-edit-card__field">
                                                            <label className="form-label">Usage</label>
                                                            <div className="outcome-edit-controls">
                                                                <div className="outcome-edit-inline">
                                                                    <input type="number" value={commodity.marketingPercentage || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'marketingPercentage', parseFloat(e.target.value))} className={`${commonInputClasses} form-control--compact`} placeholder="%" />
                                                                    <span>Marketing</span>
                                                                </div>
                                                                <div className="outcome-edit-inline">
                                                                    <input type="number" value={commodity.foodSecurityPercentage || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'foodSecurityPercentage', parseFloat(e.target.value))} className={`${commonInputClasses} form-control--compact`} placeholder="%" />
                                                                    <span>Food Security</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="outcome-edit-card__field">
                                                            <label className="form-label">Income (PHP)</label>
                                                            {(commodity.marketingPercentage || 0) > 0 ? (
                                                                <div className="outcome-edit-controls">
                                                                    <input type="number" value={commodity.income || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'income', parseFloat(e.target.value))} className={`${commonInputClasses} form-control--compact`} placeholder="0.00" />
                                                                    <span className="outcome-edit-note">
                                                                        {isCrop ? 'Per Harvest Season' : 'Annual Income'}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="outcome-edit-empty">-</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {(!editedSubproject.subprojectCommodities || editedSubproject.subprojectCommodities.length === 0) && (
                                                <p className="detail-empty">No commodities linked.</p>
                                            )}
                                        </div>
                                    </fieldset>

                                    {/* Section 5: Catch Up Plan (Conditional) */}
                                    {new Date() > new Date(editedSubproject.estimatedCompletionDate) && editedSubproject.status !== 'Completed' && (
                                        <fieldset className="border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 p-4 rounded-md">
                                            <legend className="px-2 font-semibold text-red-600 dark:text-red-400">Catch Up Plan</legend>
                                            <p className="text-xs text-red-500 mb-2">Project is delayed. Please provide a catch-up plan.</p>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remarks / Justification</label>
                                                    <textarea name="catchUpPlanRemarks" value={editedSubproject.catchUpPlanRemarks || ''} onChange={handleInputChange} rows={3} className={commonInputClasses} placeholder="Describe actions taken or justification for delay..." />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Target Completion Date</label>
                                                    <MonthYearPicker
                                                        value={editedSubproject.newTargetCompletionDate}
                                                        onChange={(val) => setEditedSubproject({...editedSubproject, newTargetCompletionDate: val})}
                                                        placeholder="Select month"
                                                        defaultYear={new Date().getFullYear()}
                                                        className="h-10"
                                                    />
                                                </div>
                                            </div>
                                        </fieldset>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="detail-edit-footer">
                            <button type="button" onClick={() => setEditMode('none')} className="btn btn-secondary">Cancel</button>
                            <button type="submit" className="btn btn-primary">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="detail-page">
             <header className="detail-header">
                <div className="detail-heading">
                    <h1 className="detail-title">{subproject.name}</h1>
                    <p className="detail-meta">{subproject.location}</p>
                </div>
                <div className="detail-actions">
                    {/* Granular Buttons - Prepare for individual role toggles */}
                    {canEditAccomplishment && (
                        <button onClick={() => setEditMode('accomplishment')} className="btn btn-primary btn-responsive" title="Edit Accomplishment">
                            <CheckCircle2 className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Edit Accomplishment</span>
                        </button>
                    )}
                    <button onClick={onBack} className="btn btn-secondary btn-responsive" title={`Back to ${previousPageName}`}>
                        <ArrowLeft className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Back to {previousPageName}</span>
                    </button>
                </div>
            </header>

            {/* Main Content Grid */}
            <div className="detail-grid">
                {/* Left Column */}
                <div className="detail-main">
                     <div className="detail-card">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="detail-card-title mb-0">Project Details</h3>
                            {canEditProjectDetails && (
                                <button onClick={() => setEditMode('details')} className="table-action table-action--primary">
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Details
                                </button>
                            )}
                        </div>
                         <div className="detail-dl">
                            <DetailItem label="Status" value={<span className={getStatusBadge(subproject.status)}>{subproject.status}</span>} />
                            <DetailItem label="UID" value={subproject.uid} />
                            <DetailItem label="Operating Unit" value={subproject.operatingUnit || 'N/A'} />
                            <DetailItem label="Package" value={subproject.packageType} />
                            <DetailItem label="IPO" value={subproject.indigenousPeopleOrganization} />
                            <DetailItem label="Estimated Completion" value={formatMonthYear(subproject.estimatedCompletionDate)} />
                            <DetailItem label="Actual Completion" value={formatMonthYear(subproject.actualCompletionDate)} />
                            <DetailItem label="Funding Year" value={subproject.fundingYear?.toString()} />
                            <DetailItem label="Fund Type" value={subproject.fundType} />
                            <DetailItem label="Tier" value={subproject.tier} />
                         </div>
                         
                         {/* Completion Progress Bar */}
                         <div className="mt-6">
                             <div className="flex justify-between items-center mb-1">
                                 <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Project Completion (Items Delivered)</span>
                                 <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{projectCompletionStats.text}</span>
                             </div>
                             <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                 <div 
                                    className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500" 
                                    style={{ width: `${projectCompletionStats.percent}%` }}
                                 ></div>
                             </div>
                         </div>

                         <div className="mt-6">
                             <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Remarks</h4>
                             <p className="detail-note">{subproject.remarks || 'No remarks provided.'}</p>
                         </div>
                     </div>

                     {/* New Target Commodities Section */}
                     <div className="detail-card">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="detail-card-title mb-0">Target Commodities</h3>
                            {canEditCommodity && (
                                <button onClick={() => setEditMode('commodity')} className="table-action table-action--primary">
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Commodity
                                </button>
                            )}
                        </div>
                         {subproject.subprojectCommodities && subproject.subprojectCommodities.length > 0 ? (
                            <ul className="detail-list">
                                {subproject.subprojectCommodities.map((c, idx) => (
                                    <li key={idx} className="detail-list-item flex justify-between items-center">
                                        <div>
                                            <span className="detail-list-name">{c.name}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({c.typeName || 'N/A'})</span>
                                        </div>
                                        <span className="text-gray-500 dark:text-gray-400">
                                            {c.typeName === 'Livestock' ? 'Heads' : 'Area'}: {c.area} {c.typeName === 'Crop' && `| Yield: ${c.averageYield} kg`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="detail-empty">No commodities recorded.</p>
                        )}
                     </div>

                     <div className="detail-card">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="detail-card-title mb-0">Budget Breakdown</h3>
                            {canEditBudget && (
                                <button onClick={() => setEditMode('budget')} className="table-action table-action--primary">
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Budget
                                </button>
                            )}
                        </div>
                        <div className="data-table-scroll">
                           <table className="data-table">
                                <thead>
                                    <tr>
                                        <th className="px-4 py-2 text-left">Particulars</th>
                                        <th className="px-4 py-2 text-left">Delivery Date</th>
                                        <th className="px-4 py-2 text-left">UACS Code</th>
                                        <th className="px-4 py-2 text-left">Obligation</th>
                                        <th className="px-4 py-2 text-left">Disbursement</th>
                                        <th className="px-4 py-2 text-right"># of Units</th>
                                        <th className="px-4 py-2 text-right">Subtotal</th>
                                        <th className="px-4 py-2 text-center">% Comp.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subproject.details.map(detail => {
                                        const actualUnits = detail.actualNumberOfUnits || 0;
                                        const targetUnits = detail.numberOfUnits || 1; // Avoid division by zero
                                        const completionPct = (actualUnits / targetUnits) * 100;
                                        
                                        return (
                                            <tr key={detail.id} className="border-b border-gray-200 dark:border-gray-700">
                                                <td className="px-4 py-2 font-medium">{detail.particulars}</td>
                                                <td className="px-4 py-2">{formatMonthYear(detail.deliveryDate)}</td>
                                                <td className="px-4 py-2">{detail.uacsCode}</td>
                                                <td className="px-4 py-2">{formatMonthYear(detail.obligationMonth)}</td>
                                                <td className="px-4 py-2">{formatMonthYear(detail.disbursementMonth)}</td>
                                                <td className="px-4 py-2 text-right">{detail.numberOfUnits.toLocaleString()} {detail.unitOfMeasure}</td>
                                                <td className="px-4 py-2 text-right font-medium">{formatCurrency(detail.pricePerUnit * detail.numberOfUnits)}</td>
                                                <td className="px-4 py-2 text-center">
                                                    <span className={`status-badge status-badge--compact ${completionPct >= 100 ? 'status-badge--completed' : 'status-badge--neutral'}`}>
                                                        {Math.min(completionPct, 100).toFixed(0)}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="font-bold bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <td colSpan={6} className="px-4 py-2 text-right">Total Budget</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(calculateTotalBudget(subproject.details))}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* NEW: Accomplishment Report Section (Read-Only) */}
                    <div className="detail-card">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="detail-card-title mb-0">Accomplishment Report</h3>
                            {canEditAccomplishment && (
                                <button onClick={() => setEditMode('accomplishment')} className="table-action table-action--primary">
                                    <CheckCircle2 className="btn-symbol" aria-hidden="true" />
                                    Edit Accomplishment
                                </button>
                            )}
                        </div>
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">Item Delivery Status</h4>
                                {subproject.details.some(d => d.actualDeliveryDate) ? (
                                    <div className="data-table-scroll">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th className="px-4 py-2 text-left">Item</th>
                                                    <th className="px-4 py-2 text-left">Actual Delivery</th>
                                                    <th className="px-4 py-2 text-right">Actual Units</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {subproject.details.filter(d => d.actualDeliveryDate).map(d => (
                                                    <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700">
                                                        <td className="px-4 py-2 font-medium">{d.particulars}</td>
                                                        <td className="px-4 py-2 text-emerald-600 dark:text-emerald-400">{formatMonthYear(d.actualDeliveryDate)}</td>
                                                        <td className="px-4 py-2 text-right">{d.actualNumberOfUnits || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="detail-empty">No items delivered yet.</p>
                                )}
                            </div>

                            {/* Financial Performance (Read-Only) */}
                            <div className="mt-8">
                                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">Financial Performance</h4>
                                {subproject.details.some(d => d.actualObligationAmount || d.actualDisbursementAmount) ? (
                                    <div className="data-table-scroll">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th className="px-4 py-2 font-medium">Expense Item</th>
                                                    <th className="px-4 py-2 font-medium text-right">Target Budget</th>
                                                    <th className="px-4 py-2 font-medium text-right">Actual Obligation</th>
                                                    <th className="px-4 py-2 font-medium text-right">Actual Disbursement</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {subproject.details.map(d => (
                                                    <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700">
                                                        <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200">{d.particulars}</td>
                                                        <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{formatCurrency(d.pricePerUnit * d.numberOfUnits)}</td>
                                                        <td className="px-4 py-2 text-right text-blue-600 dark:text-blue-400">{formatCurrency(d.actualObligationAmount || 0)}</td>
                                                        <td className="px-4 py-2 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(d.actualDisbursementAmount || 0)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="detail-empty">No financial data recorded yet.</p>
                                )}
                            </div>

                            {/* Gender and Inclusivity (Read-Only) */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">Gender and Inclusivity</h4>
                                <div className="detail-dl">
                                    <DetailItem label="PWD" value={subproject.actualPWD} />
                                    <DetailItem label="Muslim" value={subproject.actualMuslim} />
                                    <DetailItem label="LGBTQ+" value={subproject.actualLGBTQ} />
                                    <DetailItem label="Solo Parents" value={subproject.actualSoloParent} />
                                    <DetailItem label="Senior" value={subproject.actualSenior} />
                                    <DetailItem label="Youth" value={subproject.actualYouth} />
                                </div>
                            </div>

                            <div>
                                 <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">Project Outcome</h4>
                                 {subproject.subprojectCommodities && subproject.subprojectCommodities.some(c => c.actualYield || c.income) ? (
                                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                         {subproject.subprojectCommodities.map((c, i) => {
                                             const hasData = c.actualYield || c.income;
                                             if (!hasData) return null;

                                             const unit = c.typeName === 'Livestock' ? 'Heads' : 'Kilograms';
                                             const marketingVal = c.actualYield ? (c.actualYield * (c.marketingPercentage || 0) / 100) : 0;
                                             const foodSecVal = c.actualYield ? (c.actualYield * (c.foodSecurityPercentage || 0) / 100) : 0;

                                             return (
                                                 <div key={i} className="detail-outcome-card">
                                                     <div className="flex justify-between items-start mb-3">
                                                         <p className="detail-outcome-title">{c.name}</p>
                                                         <span className="detail-outcome-pill">{c.typeName}</span>
                                                     </div>
                                                     
                                                     <div className="space-y-3">
                                                         <div className="detail-outcome-row">
                                                             <span className="text-xs text-gray-500 dark:text-gray-400">Total Actual Yield</span>
                                                             <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{c.actualYield?.toLocaleString() || 0} <span className="text-[10px] font-normal text-gray-400">{unit}</span></span>
                                                         </div>

                                                         <div className="grid grid-cols-1 gap-2">
                                                             {/* Marketing Section */}
                                                             <div className="detail-outcome-row detail-outcome-row--marketing detail-outcome-row--stack">
                                                                 <div className="detail-outcome-row__content mb-1">
                                                                     <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase">Marketing ({c.marketingPercentage || 0}%)</span>
                                                                     <span className="text-xs font-bold text-blue-900 dark:text-blue-100">{marketingVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}</span>
                                                                 </div>
                                                                 {c.income && (
                                                                     <div className="flex justify-between items-center border-t border-blue-200 dark:border-blue-800 mt-1 pt-1">
                                                                         <span className="text-[10px] text-blue-600 dark:text-blue-400">Actual Income</span>
                                                                         <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(c.income)}</span>
                                                                     </div>
                                                                 )}
                                                             </div>

                                                             {/* Food Security Section */}
                                                             <div className="detail-outcome-row detail-outcome-row--food">
                                                                 <div className="detail-outcome-row__content">
                                                                     <span className="text-[10px] font-bold text-orange-700 dark:text-orange-300 uppercase">Food Security ({c.foodSecurityPercentage || 0}%)</span>
                                                                     <span className="text-xs font-bold text-orange-900 dark:text-orange-100">{foodSecVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}</span>
                                                                 </div>
                                                             </div>
                                                         </div>
                                                     </div>
                                                 </div>
                                             );
                                         })}
                                     </div>
                                 ) : (
                                     <p className="detail-empty">No outcome data recorded yet.</p>
                                 )}
                            </div>
                        </div>
                    </div>

                </div>
                 {/* Right Column */}
                <div className="detail-aside">
                     <div className="detail-card">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="detail-card-title mb-0">History</h3>
                            {subproject.history && subproject.history.length > 5 && (
                                <select 
                                    value={historyLimit} 
                                    onChange={(e) => setHistoryLimit(Number(e.target.value))}
                                    className="form-control"
                                >
                                    <option value={5}>5</option>
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={subproject.history.length}>All</option>
                                </select>
                            )}
                        </div>
                        {subproject.history && subproject.history.length > 0 ? (
                            <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 py-2">
                                <ul className="space-y-8">
                                    {subproject.history.slice(0, historyLimit).map((entry, index) => (
                                        <li key={index} className="ml-8 relative">
                                            <span className="absolute flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full -left-[35px] ring-4 ring-white dark:ring-gray-800"></span>
                                            <time className="mb-1 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</time>
                                            <p className="font-semibold text-gray-900 dark:text-white">{entry.event}</p>
                                            <p className="text-sm font-normal text-gray-500 dark:text-gray-400">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="detail-empty">No historical data available.</p>
                        )}
                    </div>
                </div>
            </div>
            {/* Delivery Date Confirmation Modal */}
            {confirmDeliveryDate && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="dashboard-modal">
                        <h3 className="detail-card-title">Confirm Delivery Date</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                            The delivery date you selected is beyond the subproject's estimated completion date. 
                            Do you want to update the subproject's estimated completion date to match this delivery date?
                        </p>
                        <div className="flex justify-end gap-4">
                            <button onClick={handleCancelDeliveryDate} className="btn btn-secondary">Cancel</button>
                            <button onClick={handleConfirmDeliveryDate} className="btn btn-primary">Confirm & Update</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubprojectDetail;
