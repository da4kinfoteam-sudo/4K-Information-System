import { validateResourceBytes } from '../supabase/functions/_shared/resourcesProtocol';

export const RESOURCE_PREVIEW_CSP="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const forbiddenCss=/url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding/i;
export const escapePreviewText=(value:unknown)=>String(value??'').replace(/[&<>"']/g,value=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]!));
export const resourcePreviewDocument=(body:string,styles='')=>`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${RESOURCE_PREVIEW_CSP}"><meta name="referrer" content="no-referrer"><style>body{margin:16px;font:14px system-ui;color:#1e2723;background:white}table{border-collapse:collapse}th,td{border:1px solid #cdd4d0;padding:6px 10px}img{max-width:100%;height:auto}${styles}</style></head><body>${body}</body></html>`;

export async function renderResourceDocx(bytes:Uint8Array) {
    validateResourceBytes('preview.docx','',bytes);
    const [{default:JSZip},docx,{default:DOMPurify}]=await Promise.all([import('jszip'),import('docx-preview'),import('dompurify')]);
    const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});let nodes=0,xmlBytes=0;
    for(const [name,part] of Object.entries(zip.files)){
        if(part.dir || !/\.(xml|rels)$/i.test(name))continue;
        const text=await part.async('string');xmlBytes+=text.length;
        if(xmlBytes>8*1024*1024 || /<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('This document exceeds the safe preview limits. Download the original to view it.');
        const xml=new DOMParser().parseFromString(text,'application/xml');
        if(xml.getElementsByTagName('parsererror').length)throw new Error('The document XML could not be previewed. Download the original to view it.');
        nodes+=xml.getElementsByTagName('*').length;
        if(nodes>100000)throw new Error('This document is too complex for an inline preview. Download the original to view it.');
        for(const element of Array.from(xml.getElementsByTagName('*'))){
            if((element.localName==='Relationship' && (element.getAttribute('TargetMode')==='External' || /vmlDrawing|aFChunk/i.test(element.getAttribute('Type')||''))) || ['pict','object','altChunk','shape','script','foreignObject'].includes(element.localName))element.remove();
        }
        zip.file(name,new XMLSerializer().serializeToString(xml));
    }
    for(const [name,part] of Object.entries(zip.files)){
        if(part.dir || !/^word\/media\//i.test(name))continue;
        if(!/\.(png|jpe?g)$/i.test(name)){zip.remove(name);continue;}
        try{validateResourceBytes(name.split('/').pop()!,'',await part.async('uint8array'));}catch{zip.remove(name);}
    }
    const preview=await zip.generateAsync({type:'uint8array',compression:'STORE'});
    const container=document.createElement('div'),styleContainer=document.createElement('div');
    await docx.renderAsync(preview,container,styleContainer,{inWrapper:false,ignoreFonts:true,ignoreWidth:true,ignoreHeight:true,renderAltChunks:false,renderComments:false,renderChanges:false,useBase64URL:true});
    for(const element of Array.from(container.querySelectorAll<HTMLElement>('*'))){
        element.removeAttribute('href');element.removeAttribute('xlink:href');element.removeAttribute('srcset');
        if(forbiddenCss.test(element.getAttribute('style')||''))element.removeAttribute('style');
        if(element.tagName==='IMG'&&!/^data:image\/(png|jpeg);base64,/i.test(element.getAttribute('src')||''))element.remove();
    }
    const body=DOMPurify.sanitize(container.innerHTML,{USE_PROFILES:{html:true},FORBID_TAGS:['iframe','object','embed','form','input','button','audio','video','svg','math','link','meta','script','style'],FORBID_ATTR:['href','srcset','formaction','action','target']});
    const styles=Array.from(styleContainer.querySelectorAll('style')).map(style=>style.textContent||'').filter(value=>!forbiddenCss.test(value)).join('\n').replace(/<\/style/gi,'');
    return resourcePreviewDocument(body,styles);
}

export interface ResourceSheet {name:string;rows:string[][];merges:{s:{r:number;c:number};e:{r:number;c:number}}[];truncated:boolean;}
export function resourceSheetHtml(sheet:ResourceSheet,page:number,size=50){
    const start=page*size,end=Math.min(sheet.rows.length,start+size);
    const html=sheet.rows.slice(start,end).map((row,index)=>{
        const r=start+index;
        return '<tr><th scope="row">'+(r+1)+'</th>'+row.map((text,c)=>{
            const merge=sheet.merges.find(merge=>r>=merge.s.r&&r<=merge.e.r&&c>=merge.s.c&&c<=merge.e.c);
            if(merge && (c!==merge.s.c || r!==Math.max(start,merge.s.r)))return '';
            const span=merge?` rowspan="${Math.min(end-1,merge.e.r)-Math.max(start,merge.s.r)+1}" colspan="${merge.e.c-merge.s.c+1}"`:'';
            const value=merge?sheet.rows[merge.s.r]?.[merge.s.c]??text:text;
            return `<td${span} title="${escapePreviewText(value)}">${escapePreviewText(value)}</td>`;
        }).join('')+'</tr>';
    }).join('');
    return resourcePreviewDocument(`<table aria-label="${escapePreviewText(sheet.name)}"><tbody>${html}</tbody></table>`,'td{max-width:420px;white-space:pre-wrap;overflow-wrap:anywhere;vertical-align:top}th{position:sticky;left:0;background:#f1f3f2}');
}
