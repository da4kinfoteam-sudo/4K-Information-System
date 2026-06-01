import React, { useEffect, useState } from 'react';

interface FormattedAmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
    value: number;
    onValueChange: (value: number) => void;
    emptyWhenZero?: boolean;
}

const amountFormatter = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const stripAmountFormatting = (value: string) => value.replace(/,/g, '').trim();

const formatEditableAmount = (value: number, emptyWhenZero = false) => {
    if (emptyWhenZero && !value) return '';
    return amountFormatter.format(Number.isFinite(value) ? value : 0);
};

const addGroupingSeparators = (value: string) => {
    if (!value) return '';
    const [integerPart, decimalPart] = value.split('.');
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimalPart !== undefined ? `${groupedInteger}.${decimalPart}` : groupedInteger;
};

export const parseFormattedAmount = (value: string) => {
    const parsed = Number.parseFloat(stripAmountFormatting(value));
    return Number.isFinite(parsed) ? parsed : 0;
};

export const FormattedAmountInput: React.FC<FormattedAmountInputProps> = ({
    value,
    onValueChange,
    emptyWhenZero = false,
    onBlur,
    onFocus,
    ...props
}) => {
    const [displayValue, setDisplayValue] = useState(() => formatEditableAmount(value, emptyWhenZero));
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setDisplayValue(formatEditableAmount(value, emptyWhenZero));
        }
    }, [emptyWhenZero, isFocused, value]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = stripAmountFormatting(event.target.value);
        if (!/^\d*\.?\d{0,2}$/.test(rawValue)) return;

        setDisplayValue(addGroupingSeparators(rawValue));
        onValueChange(parseFormattedAmount(rawValue));
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        onFocus?.(event);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        setDisplayValue(formatEditableAmount(parseFormattedAmount(displayValue), emptyWhenZero));
        onBlur?.(event);
    };

    return (
        <input
            {...props}
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
        />
    );
};
