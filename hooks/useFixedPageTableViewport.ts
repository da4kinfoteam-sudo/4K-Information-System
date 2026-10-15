import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export function useFixedPageTableViewport(enabled = true, visibleRows = 10) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [maxHeight, setMaxHeight] = useState<number>();
    useLayoutEffect(() => {
        const scroll = scrollRef.current;
        const table = scroll?.querySelector('table');
        if (!enabled || !scroll || !table) return;
        const measure = () => {
            const row = table.querySelector('tbody tr');
            if (!row || row.querySelector('[colspan]')) return;
            const style = getComputedStyle(scroll);
            const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
            const scrollbar = Math.max(0, scroll.offsetHeight - scroll.clientHeight - border);
            // Capacity is based on the default page, never the selected page size.
            const height = Math.ceil((table.tHead?.getBoundingClientRect().height || 0)
                + row.getBoundingClientRect().height * visibleRows
                + (table.tFoot?.getBoundingClientRect().height || 0) + border + scrollbar);
            setMaxHeight(previous => previous === height ? previous : height);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(table);
        observer.observe(scroll);
        return () => observer.disconnect();
    }, [enabled, visibleRows]);
    return { scrollRef, viewportStyle: { maxHeight } as CSSProperties };
}
