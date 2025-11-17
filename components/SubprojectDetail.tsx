

import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { Subproject, SubprojectDetail, particularTypes, objectCodes, ObjectCode, fundTypes, tiers } from '../constants';

interface SubprojectDetailProps {
    subproject: Subproject;
    onBack: () => void;
    previousPageName: string;
    onUpdateSubproject: (updatedSubproject: Subproject) => void;
}

type SubprojectDetailInput = Omit<SubprojectDetail, 'id'>;

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const getStatusBadge = (status: Subproject['status']) => {
    const baseClasses = "px-3 py-1 text-sm font-semibold rounded-full";
    switch (status) {
        case 'Completed': return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
        case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
        case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
        case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
        default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
    }
}

const DetailItem: React.FC<{ label: string; value?: string | React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const SubprojectDetail: React.FC<SubprojectDetailProps> = ({ subproject, onBack, previousPageName, onUpdateSubproject }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedSubproject, setEditedSubproject] = useState(subproject);
    const [detailItems, setDetailItems] = useState<SubprojectDetailInput[]>([]);
     const [currentDetail, setCurrentDetail] = useState({
        type: '',
        particulars: '',
        deliveryDate: '',
        unitOfMeasure: 'pcs' as SubprojectDetail['unitOfMeasure'],
        pricePerUnit: '',
        numberOfUnits: '',
        // FIX: Widen the type of objectCode to allow any valid ObjectCode, not just the default.
        objectCode: objectCodes[0] as ObjectCode,
        obligationMonth: '',
        disbursementMonth: '',
    });
    const [dateError, setDateError] = useState('');


    useEffect(() => {
        setEditedSubproject(subproject);
        setDetailItems(subproject.details.map(({ id, ...rest }) => rest));
    }, [subproject, isEditing]);

    const totalBudget = useMemo(() => {
       return detailItems.reduce((acc, item) => acc + (Number(item.pricePerUnit) * Number(item.numberOfUnits)), 0);
    }, [detailItems]);

    const calculateTotalBudget = (details: SubprojectDetail[]) => {
        return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
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
        } else {
            setEditedSubproject(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'type') {
            setCurrentDetail(prev => ({ ...prev, type: value, particulars: '' }));
        } else {
            setCurrentDetail(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleAddDetail = () => {
        setDateError('');
        if (!editedSubproject.startDate || !editedSubproject.estimatedCompletionDate) {
            alert('Please set the project Start Date and Estimated Completion Date first.');
            return;
        }
        if (!currentDetail.type || !currentDetail.particulars || !currentDetail.deliveryDate || !currentDetail.pricePerUnit || !currentDetail.numberOfUnits || !currentDetail.obligationMonth || !currentDetail.disbursementMonth) {
            alert('Please fill out all detail fields.');
            return;
        }
        const delivery = new Date(currentDetail.deliveryDate + 'T00:00:00Z');
        const start = new Date(editedSubproject.startDate + 'T00:00:00Z');
        const end = new Date(editedSubproject.estimatedCompletionDate + 'T00:00:00Z');

        if (delivery < start || delivery > end) {
            setDateError(`Delivery date must be between the project timeline (${formatDate(editedSubproject.startDate)} to ${formatDate(editedSubproject.estimatedCompletionDate)}).`);
            return;
        }

        setDetailItems(prev => [...prev, {
            type: currentDetail.type,
            particulars: currentDetail.particulars,
            deliveryDate: currentDetail.deliveryDate,
            unitOfMeasure: currentDetail.unitOfMeasure,
            pricePerUnit: parseFloat(currentDetail.pricePerUnit),
            numberOfUnits: parseInt(currentDetail.numberOfUnits, 10),
            objectCode: currentDetail.objectCode,
            obligationMonth: currentDetail.obligationMonth,
            disbursementMonth: currentDetail.disbursementMonth,
        }]);
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: '', numberOfUnits: '', objectCode: objectCodes[0], obligationMonth: '', disbursementMonth: '' });
    };

    const handleRemoveDetail = (indexToRemove: number) => {
        setDetailItems(prev => prev.filter((_, index) => index !== indexToRemove));
    };
    
    const handleEditParticular = (indexToEdit: number) => {
        const itemToEdit = detailItems[indexToEdit];
        setCurrentDetail({
            type: itemToEdit.type,
            particulars: itemToEdit.particulars,
            deliveryDate: itemToEdit.deliveryDate,
            unitOfMeasure: itemToEdit.unitOfMeasure,
            pricePerUnit: String(itemToEdit.pricePerUnit),
            numberOfUnits: String(itemToEdit.numberOfUnits),
            objectCode: itemToEdit.objectCode,
            obligationMonth: itemToEdit.obligationMonth,
            disbursementMonth: itemToEdit.disbursementMonth,
        });
        handleRemoveDetail(indexToEdit);
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const updatedSubprojectWithDetails = {
            ...editedSubproject,
            details: detailItems.map((d, i) => ({ ...d, id: i + 1 }))
        };
        onUpdateSubproject(updatedSubprojectWithDetails);
        setIsEditing(false);
    };

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";


    if (isEditing) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Editing: {subproject.name}</h1>
                <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    {/* Core Details */}
                    <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium">Subproject Name</label>
                            <input type="text" name="name" id="name" value={editedSubproject.name} onChange={handleInputChange} required className={commonInputClasses} />
                        </div>
                         <div>
                            <label htmlFor="status" className="block text-sm font-medium">Status</label>
                            <select id="status" name="status" value={editedSubproject.status} onChange={handleInputChange} required className={commonInputClasses}>
                                <option>Proposed</option> <option>Ongoing</option> <option>Completed</option> <option>Cancelled</option>
                            </select>
                        </div>
                    </fieldset>
                    {/* Timeline */}
                    <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="startDate" className="block text-sm font-medium">Start Date</label>
                            <input type="date" name="startDate" id="startDate" value={editedSubproject.startDate} onChange={handleInputChange} required className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="estimatedCompletionDate" className="block text-sm font-medium">Est. Completion</label>
                            <input type="date" name="estimatedCompletionDate" id="estimatedCompletionDate" value={editedSubproject.estimatedCompletionDate} onChange={handleInputChange} required className={commonInputClasses} />
                        </div>
                        {editedSubproject.status === 'Completed' && (
                             <div>
                                <label htmlFor="actualCompletionDate" className="block text-sm font-medium">Actual Completion</label>
                                <input type="date" name="actualCompletionDate" id="actualCompletionDate" value={editedSubproject.actualCompletionDate} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                        )}
                    </fieldset>
                    {/* Funding Details */}
                    <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="fundingYear" className="block text-sm font-medium">Funding Year</label>
                            <input type="number" name="fundingYear" id="fundingYear" value={editedSubproject.fundingYear} onChange={handleInputChange} min="2000" max="2100" className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="fundType" className="block text-sm font-medium">Fund Type</label>
                            <select name="fundType" id="fundType" value={editedSubproject.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                {fundTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="tier" className="block text-sm font-medium">Tier</label>
                            <select name="tier" id="tier" value={editedSubproject.tier} onChange={handleInputChange} className={commonInputClasses}>
                                {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </fieldset>
                    {/* Budget */}
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Budget Details</legend>
                        <div className="space-y-2 mb-4">
                            {detailItems.map((item, index) => (
                                <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md">
                                    <span className="text-sm font-semibold">{item.particulars} ({formatCurrency(item.pricePerUnit * item.numberOfUnits)})</span>
                                     <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => handleEditParticular(index)} className="text-gray-400 hover:text-accent dark:hover:text-accent">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                        </button>
                                        <button type="button" onClick={() => handleRemoveDetail(index)} className="text-gray-400 hover:text-red-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                           <div className="lg:col-span-2"><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Type</label><select name="type" value={currentDetail.type} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"}><option value="">Select type</option>{Object.keys(particularTypes).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                           <div className="lg:col-span-2"><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Item</label><select name="particulars" value={currentDetail.particulars} onChange={handleDetailChange} disabled={!currentDetail.type} className={commonInputClasses + " py-1.5 text-sm disabled:bg-gray-200"}><option value="">Select item</option>{currentDetail.type && particularTypes[currentDetail.type].map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                           <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Delivery Date</label><input type="date" name="deliveryDate" value={currentDetail.deliveryDate} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} />{dateError && <p className="text-xs text-red-500 mt-1">{dateError}</p>}</div>
                           <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Object Code</label><select name="objectCode" value={currentDetail.objectCode} onChange={(e) => handleDetailChange(e as React.ChangeEvent<HTMLSelectElement>)} className={commonInputClasses + " py-1.5 text-sm"}><option value="">Select code</option>{objectCodes.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                           <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Obligation Month</label><input type="date" name="obligationMonth" value={currentDetail.obligationMonth} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                           <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Disbursement Month</label><input type="date" name="disbursementMonth" value={currentDetail.disbursementMonth} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                           <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Unit</label><select name="unitOfMeasure" value={currentDetail.unitOfMeasure} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"}><option>pcs</option><option>kgs</option><option>unit</option><option>lot</option></select></div>
                           <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Price/Unit</label><input type="number" name="pricePerUnit" value={currentDetail.pricePerUnit} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                           <div className="flex-1"><label className="block text-xs font-medium text-gray-600 dark:text-gray-400"># of Units</label><input type="number" name="numberOfUnits" value={currentDetail.numberOfUnits} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                           <button type="button" onClick={handleAddDetail} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50 text-accent dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900">+</button>
                        </div>
                         <div className="text-right font-bold mt-4">Total: {formatCurrency(totalBudget)}</div>
                    </fieldset>
                    {/* Remarks */}
                    <div>
                        <label htmlFor="remarks" className="block text-sm font-medium">Remarks</label>
                        <textarea name="remarks" id="remarks" value={editedSubproject.remarks} onChange={handleInputChange} rows={4} className={commonInputClasses} />
                    </div>
                    {/* Actions */}
                    <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                        <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-accent hover:brightness-95">Save Changes</button>
                    </div>
                </form>
            </div>
        )
    }

    return (
        <div className="space-y-8">
             <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{subproject.name}</h1>
                    <p className="text-md text-gray-500 dark:text-gray-400">{subproject.location}</p>
                </div>
                <div className="flex items-center gap-4">
                     <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-accent hover:brightness-95">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                        Edit
                    </button>
                    <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to {previousPageName}
                    </button>
                </div>
            </header>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-8">
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Project Details</h3>
                         <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <DetailItem label="Status" value={<span className={getStatusBadge(subproject.status)}>{subproject.status}</span>} />
                            <DetailItem label="Package" value={subproject.packageType} />
                            <DetailItem label="IPO" value={subproject.indigenousPeopleOrganization} />
                            <DetailItem label="Start Date" value={formatDate(subproject.startDate)} />
                            <DetailItem label="Est. Completion" value={formatDate(subproject.estimatedCompletionDate)} />
                            <DetailItem label="Actual Completion" value={formatDate(subproject.actualCompletionDate)} />
                            <DetailItem label="Funding Year" value={subproject.fundingYear?.toString()} />
                            <DetailItem label="Fund Type" value={subproject.fundType} />
                            <DetailItem label="Tier" value={subproject.tier} />
                         </div>
                         <div className="mt-6">
                             <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Remarks</h4>
                             <p className="mt-1 text-sm text-gray-800 dark:text-gray-100 italic bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">{subproject.remarks || 'No remarks provided.'}</p>
                         </div>
                     </div>
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Budget Breakdown</h3>
                        <div className="overflow-x-auto">
                           <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Particulars</th>
                                        <th className="px-4 py-2 text-left">Delivery Date</th>
                                        <th className="px-4 py-2 text-left">Object Code</th>
                                        <th className="px-4 py-2 text-left">Obligation</th>
                                        <th className="px-4 py-2 text-left">Disbursement</th>
                                        <th className="px-4 py-2 text-right"># of Units</th>
                                        <th className="px-4 py-2 text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subproject.details.map(detail => (
                                        <tr key={detail.id} className="border-b border-gray-200 dark:border-gray-700">
                                            <td className="px-4 py-2 font-medium">{detail.particulars}</td>
                                            <td className="px-4 py-2">{formatDate(detail.deliveryDate)}</td>
                                            <td className="px-4 py-2">{detail.objectCode}</td>
                                            <td className="px-4 py-2">{formatDate(detail.obligationMonth)}</td>
                                            <td className="px-4 py-2">{formatDate(detail.disbursementMonth)}</td>
                                            <td className="px-4 py-2 text-right">{detail.numberOfUnits.toLocaleString()} {detail.unitOfMeasure}</td>
                                            <td className="px-4 py-2 text-right font-medium">{formatCurrency(detail.pricePerUnit * detail.numberOfUnits)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="font-bold bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <td colSpan={6} className="px-4 py-2 text-right">Total Budget</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(calculateTotalBudget(subproject.details))}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
                 {/* Right Column */}
                <div className="space-y-8">
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">History</h3>
                        {subproject.history && subproject.history.length > 0 ? (
                            <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 py-2">
                                <ul className="space-y-8">
                                    {subproject.history.map((entry, index) => (
                                        <li key={index} className="ml-8 relative">
                                            <span className="absolute flex items-center justify-center w-4 h-4 bg-accent rounded-full -left-[35px] ring-4 ring-white dark:ring-gray-800"></span>
                                            <time className="mb-1 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</time>
                                            <p className="font-semibold text-gray-900 dark:text-white">{entry.event}</p>
                                            <p className="text-sm font-normal text-gray-500 dark:text-gray-400">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No historical data available.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SubprojectDetail;