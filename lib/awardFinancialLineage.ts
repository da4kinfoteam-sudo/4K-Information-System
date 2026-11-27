export interface AwardTransferLink {
    id:string;entityType:'activities'|'subprojects';sourceId:string;destinationId:string;itemIds:string[];
    sourceOu:string;destinationOu:string;resolvedAt:string;
}
export const awardFinancialKey=(type:string,parent:string,item:string|null)=>`${type}:${parent}:line:${item??'$parent'}`;

// Only applied, scope-validated transfer links enter this graph. Values/dates are not identity proof.
export function buildAwardFinancialLineage(links:AwardTransferLink[]){
    const incoming=new Map<string,Array<{key:string;id:string}>>(),cache=new Map<string,{keys:string[];transferIds:string[];ambiguous:boolean}>();
    for(const link of links)for(const item of link.itemIds){
        const destination=awardFinancialKey(link.entityType,link.destinationId,item),source=awardFinancialKey(link.entityType,link.sourceId,item);
        incoming.set(destination,[...(incoming.get(destination)||[]),{key:source,id:link.id}]);
    }
    return (key:string)=>{
        const saved=cache.get(key);if(saved)return saved;
        const keys=[key],transferIds:string[]=[],seen=new Set(keys);let cursor=key,ambiguous=false;
        while(incoming.has(cursor)){
            const edges=incoming.get(cursor)!;
            if(edges.length!==1||seen.has(edges[0].key)){ambiguous=true;break;}
            const edge=edges[0];keys.push(edge.key);transferIds.push(edge.id);seen.add(edge.key);cursor=edge.key;
        }
        const result={keys,transferIds,ambiguous};cache.set(key,result);return result;
    };
}

interface ReplacementLine {
    itemId:string|null;line:Record<string,any>;
    obligation:{source:string;entries:Record<string,any>[]};disbursement:{source:string;entries:Record<string,any>[]};replacementItemIds?:string[];
}
export function groupAwardReplacementLines(type:string,parent:string,lines:ReplacementLine[],issue:(key:string,message:string)=>void):ReplacementLine[]{
    if(type!=='subprojects')return lines;
    const byId=new Map(lines.filter(row=>row.itemId!==null).map(row=>[row.itemId!,row])),roots=new Map<string,string>(),groups=new Map<string,ReplacementLine[]>();
    for(const row of lines){
        if(row.itemId===null||row.line.adjustmentType!=='Replacement'||row.line.adjustmentFundingSource!=='Original Allocation')continue;
        let current=row;const seen=new Set<string>([row.itemId]);let root:string|undefined;
        while(current.line.adjustmentType==='Replacement'&&current.line.adjustmentFundingSource==='Original Allocation'){
            const sourceId=String(current.line.replacementOfItemId??current.line.sourceItemId??''),source=byId.get(sourceId);
            if(!source||seen.has(sourceId)||!source.line.isSuperseded||source.line.isCancelled||!Array.isArray(source.line.replacedByItemIds)||!source.line.replacedByItemIds.some((id:unknown)=>String(id)===current.itemId)){
                issue(awardFinancialKey(type,parent,row.itemId),'The replacement item does not have a complete, unambiguous original-allocation relationship.');root=undefined;break;
            }
            seen.add(sourceId);root=sourceId;current=source;
        }
        if(root)roots.set(row.itemId,root);
    }
    for(const [id,root] of roots){
        const rows=groups.get(root)||[byId.get(root)!];if(!rows.some(row=>row.itemId===id))rows.push(byId.get(id)!);groups.set(root,rows);
    }
    const claimed=new Set([...groups.values()].flatMap(rows=>rows.map(row=>row.itemId!)));
    const result=lines.filter(row=>row.itemId===null||!claimed.has(row.itemId));
    for(const [root,rows] of groups){
        const original=byId.get(root)!;
        const stages=Object.fromEntries((['obligation','disbursement'] as const).map(stage=>[stage,{source:'composite',entries:rows.flatMap(row=>row[stage].entries.map(entry=>({...entry,awardStorageSource:row[stage].source,awardOriginLineKey:awardFinancialKey(type,parent,row.itemId)})))}]));
        result.push({...original,...stages,replacementItemIds:rows.map(row=>row.itemId!)} as ReplacementLine);
    }
    return result;
}
