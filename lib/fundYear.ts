import { addYears, format, isValid, parseISO } from 'date-fns';

export const isValidFundYear = (value: unknown): boolean => /^[1-9]\d{3}$/.test(String(value ?? ''));
const preferenceKey = 'dcf_fund_year_choices';
export function getFundYearOptions(saved?: unknown, current = new Date().getFullYear()): string[] {
    let recent: unknown[] = [];
    try { const data = JSON.parse(localStorage.getItem(preferenceKey) || '[]'); if (Array.isArray(data)) recent = data; } catch { /* Preferences are optional. */ }
    return [...new Set([...Array.from({ length: Math.max(11, current + 6 - 2019) }, (_, index) => String(Math.min(2019, current - 5) + index)), ...recent, saved, current]
        .map(value => String(value ?? '')).filter(isValidFundYear))].sort((a, b) => Number(a) - Number(b));
}
export function rememberFundYear(year: number) {
    if (!isValidFundYear(year)) return;
    try { localStorage.setItem(preferenceKey, JSON.stringify(getFundYearOptions(year))); } catch { /* Preferences are optional. */ }
}
export function shiftFundYearDate(value: string, nextYear: number, previousYear?: number): string {
    if (!value) return value;
    const date = parseISO(value);
    if (!isValid(date) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const changed = addYears(date, nextYear - (isValidFundYear(previousYear) ? Number(previousYear) : date.getFullYear()));
    if (!isValid(changed) || !isValidFundYear(changed.getFullYear())) throw new Error('The rescheduled dates must remain within years 1000 to 9999. Keep existing dates or choose another Fund Year.');
    return format(changed, 'yyyy-MM-dd');
}

// Save handlers use the live textbox, not a previously committed numeric value.
export function validateFundYearFields(root?: EventTarget | null): boolean {
    const container = root instanceof Element ? root : document;
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input[data-fund-year]')].filter(input => !input.matches(':disabled'));
    const invalid = inputs.find(input => input.dataset.yearPending === 'true'
        || (!isValidFundYear(input.value) && !(input.value === '' && input.dataset.yearAllowEmpty === 'true'))
        || input.value !== input.dataset.committedYear);
    if (!invalid) return true;
    invalid.dispatchEvent(new Event('validate-fund-year'));
    invalid.focus();
    return false;
}
