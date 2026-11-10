import { validateFundYearFields } from './fundYear';

export async function validateDcfForm(root?: EventTarget | null): Promise<boolean> {
    if (!validateFundYearFields(root)) return false;
    const container = root instanceof Element ? root : document;
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input[data-dcf-date]')].filter(input => !input.matches(':disabled'));
    const changed = inputs.some(input => input.value !== input.dataset.committedDate || input.dataset.datePending === 'true');
    const intended = inputs.map(input => input.value);
    const results = await Promise.all(inputs.map(input => {
        const detail: { result?: Promise<boolean> } = {};
        input.dispatchEvent(new CustomEvent('flush-dcf-date', { detail }));
        return detail.result ?? Promise.resolve(false);
    }));
    if (!results.every(Boolean) || !validateFundYearFields(root)) return false;
    if (changed && root instanceof HTMLFormElement) {
        // Resume through the newly rendered handler, not the old state closure.
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (root.isConnected && inputs.every((input, index) => input.value === intended[index] && input.dataset.committedDate === intended[index])) root.requestSubmit();
        return false;
    }
    return true;
}
