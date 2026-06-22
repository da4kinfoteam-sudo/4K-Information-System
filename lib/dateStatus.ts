export const parseDateOnly = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString.includes('T') ? dateString : `${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
};

export const isMonthTargetOverdue = (targetDate?: string, today = new Date()) => {
    const dueDate = parseDateOnly(targetDate);
    if (!dueDate) return false;

    return (
        dueDate.getFullYear() < today.getFullYear() ||
        (dueDate.getFullYear() === today.getFullYear() && dueDate.getMonth() < today.getMonth())
    );
};
