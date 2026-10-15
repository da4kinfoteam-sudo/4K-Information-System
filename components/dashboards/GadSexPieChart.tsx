import React, { useId, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface GadSexChartValues { female: number | null; male: number | null; context: string }
interface Props extends GadSexChartValues { title: string }
const number = (value: number) => value.toLocaleString('en-PH');

export default function GadSexPieChart({ title, female, male, context }: Props) {
    const titleId = useId();
    const [selectedSex, setSelectedSex] = useState<string | null>(null);
    const data = [
        { name: 'Female', value: female, color: '#168a55' },
        { name: 'Male', value: male, color: '#2f6fed' },
    ];
    const total = (female ?? 0) + (male ?? 0);
    const valueLabel = (item: typeof data[number]) => item.value === null ? 'No Data'
        : `${number(item.value)} (${total > 0 ? (item.value / total * 100).toFixed(1) : '0.0'}%)`;
    const label = (item: typeof data[number]) => `${item.name}: ${valueLabel(item)}. ${context}`;
    const selected = data.find(item => item.name === selectedSex);
    return <article className="dashboard-panel gad-dashboard-chart gad-sex-chart" aria-labelledby={titleId}>
        <h3 id={titleId} title={context}>{title}</h3>
        {total > 0 ? <>
            <div className="gad-sex-chart__plot" role="img" aria-label={data.map(label).join(' ')}>
                <ResponsiveContainer width="100%" height={230}>
                    <PieChart accessibilityLayer>
                        <Pie data={data.filter(item => item.value !== null && item.value > 0)} dataKey="value" nameKey="name"
                            outerRadius="82%" isAnimationActive={false} onClick={item => setSelectedSex(item.name)}>
                            {data.filter(item => item.value !== null && item.value > 0).map(item => <Cell key={item.name} fill={item.color} />)}
                        </Pie>
                        <Tooltip formatter={(value, name) => [`${number(Number(value))} (${(Number(value) / total * 100).toFixed(1)}%)`, name]} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="gad-sex-chart__legend">
                {data.map(item => <button key={item.name} type="button" className="gad-sex-chart__label" title={label(item)}
                    aria-label={label(item)} onFocus={() => setSelectedSex(item.name)} onClick={() => setSelectedSex(item.name)}>
                    <span className="gad-sex-chart__swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
                    <span>{item.name}</span><strong>{valueLabel(item)}</strong>
                </button>)}
            </div>
            <output className="sr-only" aria-live="polite">{selected ? `${selected.name}: ${valueLabel(selected)}` : ''}</output>
        </> : <p className="dashboard-empty">{female === null && male === null ? 'No reported sex-disaggregated data.' : 'No reported people to chart.'}</p>}
    </article>;
}
