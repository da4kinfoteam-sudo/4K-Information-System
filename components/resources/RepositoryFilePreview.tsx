import React, {useEffect,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import {renderResourceDocx,resourceSheetHtml,type ResourceSheet} from '../../lib/resourceOfficePreview';
import {downloadRepositoryOriginal,type RepositoryFile,type ResourcesClient} from '../../lib/resources';
import {ResourceErrorState} from './ResourceControls';
const RepositoryPdfPreview=React.lazy(()=>import('./RepositoryPdfPreview'));
export default function RepositoryFilePreview({client,file}:{client:ResourcesClient;file:RepositoryFile}){
    const [blob,setBlob]=useState<Blob|null>(null),[url,setUrl]=useState(''),[html,setHtml]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
    const [names,setNames]=useState<string[]>([]),[name,setName]=useState(''),[sheet,setSheet]=useState<ResourceSheet|null>(null),[page,setPage]=useState(0),[downloading,setDownloading]=useState(false);
    const worker=useRef<Worker|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
    useEffect(()=>{
        const controller=new AbortController();let current=true,objectUrl='';
        setLoading(true);setError('');setBlob(null);setHtml('');setNames([]);setSheet(null);setPage(0);
        client.download(file.id,controller.signal).then(async blob=>{
            if(!current)return;setBlob(blob);
            const extension=file.file_name.split('.').pop()?.toLowerCase();
            if(extension==='docx'){const rendered=await renderResourceDocx(new Uint8Array(await blob.arrayBuffer()));if(current)setHtml(rendered);}
            else if(extension==='xlsx'||extension==='xls'){
                const active=new Worker(new URL('../../lib/resourceSpreadsheetWorker.ts',import.meta.url),{type:'module'});worker.current=active;
                const timeout=()=>{if(current){setError('The spreadsheet preview timed out. Download the original to view it.');setLoading(false);}active.terminate();};
                timer.current=setTimeout(timeout,10000);
                active.onerror=()=>{if(current){setError('The spreadsheet could not be previewed. Download the original to view it.');setLoading(false);}if(timer.current)clearTimeout(timer.current);active.terminate();};
                active.onmessage=event=>{
                    if(!current)return;if(timer.current)clearTimeout(timer.current);
                    if(event.data.error){setError(event.data.error);setLoading(false);return;}
                    if(event.data.names){setNames(event.data.names);setName(event.data.names[0]||'');if(event.data.names[0]){timer.current=setTimeout(timeout,10000);active.postMessage({sheet:event.data.names[0]});}else setLoading(false);}
                    if(event.data.sheet){setSheet(event.data.sheet);setPage(0);setLoading(false);}
                };
                const bytes=await blob.arrayBuffer();active.postMessage({bytes},[bytes]);return;
            }else if(extension!=='pdf'){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}
            if(current)setLoading(false);
        }).catch(failure=>{if(current&&!controller.signal.aborted){setError(failure instanceof Error?failure.message:'Document could not be loaded.');setLoading(false);}});
        return()=>{current=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);worker.current?.terminate();worker.current=null;if(timer.current)clearTimeout(timer.current);};
    },[client,file.id]);
    const download=async()=>{setDownloading(true);try{await downloadRepositoryOriginal(client,file);}catch(failure){setError(failure instanceof Error?failure.message:'Download failed.');}finally{setDownloading(false);}};
    return <div className="repository-preview">
        <div className="resources-actions"><button type="button" className="btn btn-secondary" onClick={()=>void download()} disabled={downloading}><Download aria-hidden="true"/>{downloading?'Downloading...':'Download Original'}</button></div>
        <ResourceErrorState error={error}/>{loading&&<p role="status">Loading preview...</p>}
        {names.length>0&&<div className="repository-preview-toolbar"><label>Worksheet<select className="form-control" value={name} disabled={loading} onChange={event=>{setName(event.target.value);setLoading(true);setError('');worker.current?.postMessage({sheet:event.target.value});timer.current=setTimeout(()=>{worker.current?.terminate();setLoading(false);setError('The spreadsheet preview timed out. Download the original to view it.');},10000);}}>{names.map(name=><option key={name}>{name}</option>)}</select></label>
            {sheet&&<div className="resources-actions"><button type="button" className="btn btn-secondary btn-sm" disabled={page===0||loading} onClick={()=>setPage(page-1)}>Previous</button><span>{page+1}/{Math.max(1,Math.ceil(sheet.rows.length/50))}</span><button type="button" className="btn btn-secondary btn-sm" disabled={(page+1)*50>=sheet.rows.length||loading} onClick={()=>setPage(page+1)}>Next</button></div>}
        </div>}
        {sheet?.truncated&&<p className="resources-preview-notice">Preview limit reached. Download the original for all worksheet contents.</p>}
        {!loading&&!error&&(html||sheet)&&<iframe title={file.file_name} sandbox="" referrerPolicy="no-referrer" className="repository-preview-frame" srcDoc={html||resourceSheetHtml(sheet!,page)}/>}
        {!loading&&!error&&url&&file.mime_type.startsWith('image/')&&<img className="repository-preview-image" src={url} alt={file.display_name||file.file_name} onError={()=>setError('The image could not be previewed. Download the original to view it.')}/>}
        {!loading&&!error&&blob&&file.mime_type==='application/pdf'&&<React.Suspense fallback={<p role="status">Loading PDF preview...</p>}><RepositoryPdfPreview blob={blob}/></React.Suspense>}
        {!loading&&!error&&!blob&&<p>Preview is unavailable.</p>}
    </div>;
}
