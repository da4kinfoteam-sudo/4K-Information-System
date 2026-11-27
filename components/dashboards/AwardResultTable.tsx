import React,{useMemo,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,RotateCcw} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from '../ui/popover';
import {ResourceTable,ResourceText} from '../resources/ResourceControls';
import {awardCellText,type AwardCell,type AwardViewColumn,type AwardViewTable} from '../../lib/awardResultView';

type TableState={filters:Record<string,string[]>;sort:null|{key:string;direction:'ascending'|'descending'}};
const choiceKey=(value:AwardCell)=>JSON.stringify(value??null);
function ColumnMenu({column,values,state,onApply}:{column:AwardViewColumn;values:AwardCell[];state:TableState;onApply:(selected:string[]|undefined,sort:TableState['sort'])=>void}){
    const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[selected,setSelected]=useState<string[]|undefined>(),[sort,setSort]=useState(state.sort);
    const ref=useRef<HTMLInputElement>(null);
    const choices=useMemo(()=>[...new Map(values.map(v=>[choiceKey(v),v])).entries()].sort((a,b)=>typeof a[1]==='number'&&typeof b[1]==='number'?a[1]-b[1]:String(a[1]??'').localeCompare(String(b[1]??''))),[values]);
    const options=choices.filter(([,v])=>awardCellText(v,column.kind).toLowerCase().includes(search.toLowerCase()));
    return <Popover open={open} onOpenChange={next=>{setOpen(next);if(next){setSearch('');setSelected(state.filters[column.key]);setSort(state.sort);}}}>
        <PopoverTrigger asChild><button type="button" className={`repository-header-trigger${state.filters[column.key]?' is-active':''}`} aria-label={`Filter and sort ${column.label}`} title={`Filter and sort ${column.label}`}>{column.label}</button></PopoverTrigger>
        <PopoverContent align="end" collisionPadding={8} className="dashboard-scope-menu ipo-column-filter repository-column-filter" onOpenAutoFocus={event=>{event.preventDefault();ref.current?.focus();}}>
            <div className="ipo-column-filter__body"><div className="ipo-column-sort" role="group" aria-label={`Sort ${column.label}`}>
                <button type="button" aria-pressed={sort?.key===column.key&&sort.direction==='ascending'} onClick={()=>setSort({key:column.key,direction:'ascending'})}><ArrowUp size={14} aria-hidden="true"/>Ascending</button>
                <button type="button" aria-pressed={sort?.key===column.key&&sort.direction==='descending'} onClick={()=>setSort({key:column.key,direction:'descending'})}><ArrowDown size={14} aria-hidden="true"/>Descending</button>
                <button type="button" title="Default Order" aria-label="Default Order" onClick={()=>setSort(null)}><RotateCcw size={14} aria-hidden="true"/></button>
            </div><div className="repository-filter-search-row"><input ref={ref} type="search" className="form-control" aria-label={`Search ${column.label} choices`} value={search} onChange={event=>setSearch(event.target.value)}/><div className="dashboard-scope-menu__actions"><button type="button" className="btn btn-secondary btn-sm" onClick={()=>setSelected(undefined)}>Select All</button><button type="button" className="btn btn-secondary btn-sm" onClick={()=>setSelected([])}>Clear</button></div></div>
            <div className="dashboard-scope-menu__options custom-scrollbar" role="group" aria-label={`${column.label} choices`}>{options.map(([key,value])=><label key={key}><input type="checkbox" checked={!selected||selected.includes(key)} onChange={event=>{const base=selected||choices.map(([k])=>k);setSelected(event.target.checked?[...new Set([...base,key])]:base.filter(k=>k!==key));}}/><span title={awardCellText(value,column.kind)}>{awardCellText(value,column.kind)||'(Blank)'}</span></label>)}{!options.length&&<p>No matching options.</p>}</div></div>
            <div className="ipo-list-menu-footer"><div><button type="button" className="btn btn-secondary btn-sm" onClick={()=>setOpen(false)}>Cancel</button><button type="button" className="btn btn-primary btn-sm" onClick={()=>{onApply(selected,sort);setOpen(false);}}>Apply</button></div></div>
        </PopoverContent>
    </Popover>;
}

export default function AwardResultTable({table}:{table:AwardViewTable;key?:string}){
    const [state,setState]=useState<TableState>({filters:{},sort:null}),[page,setPage]=useState(1),[size,setSize]=useState(10);
    const rows=useMemo(()=>{
        const filtered=table.rows.map((row,index)=>({...row,id:index})).filter(row=>(Object.entries(state.filters) as Array<[string,string[]]>).every(([key,values])=>values.includes(choiceKey(row[key]))));
        if(state.sort){const {key,direction}=state.sort;filtered.sort((a,b)=>{const av=a[key],bv=b[key];return (av==null?bv==null?0:1:bv==null?-1:typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv)))*(direction==='ascending'?1:-1)||a.id-b.id;});}
        return filtered;
    },[table.rows,state]);
    const currentPage=Math.min(page,Math.max(1,Math.ceil(rows.length/size)));
    return <article className="dashboard-panel award-panel award-result-table"><header className="dashboard-panel__header"><h3 className="dashboard-panel__title">{table.title}</h3></header>
        <ResourceTable preferences={`award-${table.key}`} compactHeaders columns={table.columns.map(column=>({key:column.key,label:column.label,width:Math.max(column.width||150,Math.ceil(column.label.length*7.5+24)),locked:true,ariaSort:state.sort?.key===column.key?state.sort.direction:undefined,header:table.filterable?<ColumnMenu column={column} values={table.rows.map(row=>row[column.key])} state={state} onApply={(selected,sort)=>{setState(current=>{const filters={...current.filters};if(selected===undefined)delete filters[column.key];else filters[column.key]=selected;return {filters,sort};});setPage(1);}}/>:undefined,render:row=><ResourceText value={awardCellText(row[column.key],column.kind)}/>}))} rows={rows.slice((currentPage-1)*size,currentPage*size)} total={rows.length} page={currentPage} pageSize={size} onPage={setPage} onPageSize={value=>{setSize(value);setPage(1);}}/>
    </article>;
}
