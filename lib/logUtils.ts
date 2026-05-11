
export const getMonetaryChanges = (oldItem: any, newItem: any, type: 'Subproject' | 'Activity' | 'Office' | 'Staffing' | 'Other') => {
    const changes: any = {};
    
    const sumDetailed = (item: any, listKey: string, valKey: string) => {
        return (item?.[listKey] || []).reduce((acc: number, curr: any) => acc + (Number(curr[valKey]) || 0), 0);
    };

    const sumDetailedProduct = (item: any, listKey: string, keyA: string, keyB: string) => {
        return (item?.[listKey] || []).reduce((acc: number, curr: any) => acc + ((Number(curr[keyA]) || 0) * (Number(curr[keyB]) || 0)), 0);
    };

    let oldVals: any = { targets: {}, accomplishments: {} };
    let newVals: any = { targets: {}, accomplishments: {} };

    if (type === 'Subproject') {
        oldVals.targets['Allocation'] = sumDetailedProduct(oldItem, 'details', 'pricePerUnit', 'numberOfUnits');
        newVals.targets['Allocation'] = sumDetailedProduct(newItem, 'details', 'pricePerUnit', 'numberOfUnits');
        
        oldVals.accomplishments['Obligated'] = sumDetailed(oldItem, 'details', 'actualObligationAmount');
        newVals.accomplishments['Obligated'] = sumDetailed(newItem, 'details', 'actualObligationAmount');
        
        oldVals.accomplishments['Disbursed'] = sumDetailed(oldItem, 'details', 'actualDisbursementAmount');
        newVals.accomplishments['Disbursed'] = sumDetailed(newItem, 'details', 'actualDisbursementAmount');
    } else if (type === 'Activity') {
        oldVals.targets['Allocation'] = sumDetailed(oldItem, 'expenses', 'amount');
        newVals.targets['Allocation'] = sumDetailed(newItem, 'expenses', 'amount');
        
        oldVals.accomplishments['Obligated'] = sumDetailed(oldItem, 'expenses', 'actualObligationAmount');
        newVals.accomplishments['Obligated'] = sumDetailed(newItem, 'expenses', 'actualObligationAmount');
        
        oldVals.accomplishments['Disbursed'] = sumDetailed(oldItem, 'expenses', 'actualDisbursementAmount');
        newVals.accomplishments['Disbursed'] = sumDetailed(newItem, 'expenses', 'actualDisbursementAmount');
    } else if (type === 'Office') {
        oldVals.targets['Allocation'] = (Number(oldItem?.pricePerUnit) || 0) * (Number(oldItem?.numberOfUnits) || 0);
        newVals.targets['Allocation'] = (Number(newItem?.pricePerUnit) || 0) * (Number(newItem?.numberOfUnits) || 0);
        
        oldVals.accomplishments['Obligated'] = Number(oldItem?.actualObligationAmount) || 0;
        newVals.accomplishments['Obligated'] = Number(newItem?.actualObligationAmount) || 0;
        
        oldVals.accomplishments['Disbursed'] = Number(oldItem?.actualDisbursementAmount) || 0;
        newVals.accomplishments['Disbursed'] = Number(newItem?.actualDisbursementAmount) || 0;
    } else if (type === 'Staffing') {
        oldVals.targets['Allocation'] = Number(oldItem?.annualSalary) || 0;
        newVals.targets['Allocation'] = Number(newItem?.annualSalary) || 0;
        
        oldVals.accomplishments['Obligated'] = Number(oldItem?.actualObligationAmount) || 0;
        newVals.accomplishments['Obligated'] = Number(newItem?.actualObligationAmount) || 0;
        
        oldVals.accomplishments['Disbursed'] = Number(oldItem?.actualDisbursementAmount) || 0;
        newVals.accomplishments['Disbursed'] = Number(newItem?.actualDisbursementAmount) || 0;
    } else if (type === 'Other') {
        oldVals.targets['Allocation'] = Number(oldItem?.amount) || 0;
        newVals.targets['Allocation'] = Number(newItem?.amount) || 0;
        
        oldVals.accomplishments['Obligated'] = Number(oldItem?.actualObligationAmount) || 0;
        newVals.accomplishments['Obligated'] = Number(newItem?.actualObligationAmount) || 0;
        
        oldVals.accomplishments['Disbursed'] = Number(oldItem?.actualDisbursementAmount) || 0;
        newVals.accomplishments['Disbursed'] = Number(newItem?.actualDisbursementAmount) || 0;
    }

    // Compare
    ['targets', 'accomplishments'].forEach(category => {
        Object.keys(oldVals[category]).forEach(label => {
            const oldV = oldVals[category][label];
            const newV = newVals[category][label];
            if (Math.abs(oldV - newV) > 0.01) { // Use epsilon for float comparison
                if (!changes[category]) changes[category] = {};
                changes[category][label] = { old: oldV, new: newV };
            }
        });
    });

    return Object.keys(changes).length > 0 ? changes : null;
};
