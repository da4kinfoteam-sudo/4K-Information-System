import React,{useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {ResourceErrorState} from './ResourceControls';

const assets=import.meta.glob([
    '/node_modules/pdfjs-dist/cmaps/*.bcmap','/node_modules/pdfjs-dist/standard_fonts/*.pfb','/node_modules/pdfjs-dist/standard_fonts/*.ttf',
    '/node_modules/pdfjs-dist/wasm/jbig2.wasm','/node_modules/pdfjs-dist/wasm/openjpeg.wasm','/node_modules/pdfjs-dist/wasm/qcms_bg.wasm',
],{eager:true,query:'?url',import:'default'}) as Record<string,string>;
class PreviewBinaryDataFactory {
    async fetch({kind,filename}:{kind:string;filename:string}){
        const directory={cMapUrl:'cmaps',standardFontDataUrl:'standard_fonts',wasmUrl:'wasm'}[kind];
        const url=directory&&assets[`/node_modules/pdfjs-dist/${directory}/${filename}`];
        if(!url||filename.includes('/')||filename.includes('..'))throw new Error('This PDF resource is not available for preview.');
        const response=await fetch(url,{credentials:'omit'});if(!response.ok)throw new Error('A PDF preview resource could not be loaded.');
        return new Uint8Array(await response.arrayBuffer());
    }
}
export default function RepositoryPdfPreview({blob}:{blob:Blob}){
    const canvas=useRef<HTMLCanvasElement>(null),container=useRef<HTMLDivElement>(null);
    const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[width,setWidth]=useState(600),[error,setError]=useState(''),[loading,setLoading]=useState(true);
    useEffect(()=>{
        let current=true,task:ReturnType<typeof import('pdfjs-dist')['getDocument']>|null=null;
        const timeout=setTimeout(()=>{if(current){setError('The PDF preview timed out. Download the original to view it.');setLoading(false);void task?.destroy();}},20000);
        (async()=>{
            const library=await import('pdfjs-dist');
            library.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
            if(!current)return;
            task=library.getDocument({data:new Uint8Array(await blob.arrayBuffer()),enableXfa:false,disableFontFace:true,useSystemFonts:true,useWorkerFetch:false,BinaryDataFactory:PreviewBinaryDataFactory,maxImageSize:32*1024*1024,canvasMaxAreaInBytes:16*1024*1024,stopAtErrors:true});
            const document=await task.promise;if(current){setPdf(document);setPage(1);}
        })().catch(failure=>{if(current){setError(failure instanceof Error?failure.message:'PDF preview failed.');setLoading(false);}}).finally(()=>clearTimeout(timeout));
        return()=>{current=false;clearTimeout(timeout);void task?.destroy();};
    },[blob]);
    useEffect(()=>{const observer=new ResizeObserver(entries=>setWidth(Math.max(200,Math.min(1000,entries[0].contentRect.width-24))));if(container.current)observer.observe(container.current);return()=>observer.disconnect();},[]);
    useEffect(()=>{
        if(!pdf||!canvas.current)return;let current=true,render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|null=null;
        setLoading(true);setError('');
        const timeout=setTimeout(()=>{if(current){render?.cancel();setError('The PDF page preview timed out. Download the original to view it.');setLoading(false);}},20000);
        pdf.getPage(page).then(async content=>{
            if(!current||!canvas.current)return;
            const scale=width/content.getViewport({scale:1}).width,viewport=content.getViewport({scale:Math.min(2,scale)});
            const target=canvas.current;target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);
            render=content.render({canvas:target,canvasContext:target.getContext('2d')!,viewport});await render.promise;
            if(current)setLoading(false);
        }).catch(failure=>{if(current&&failure?.name!=='RenderingCancelledException'){setError(failure instanceof Error?failure.message:'PDF page could not be rendered.');setLoading(false);}}).finally(()=>clearTimeout(timeout));
        return()=>{current=false;clearTimeout(timeout);render?.cancel();};
    },[pdf,page,width]);
    return <div className="repository-pdf"><div className="resources-actions"><button type="button" className="btn btn-secondary btn-sm" disabled={!pdf||page<=1} onClick={()=>setPage(page-1)}>Previous</button><span>{page} / {pdf?.numPages||1}</span><button type="button" className="btn btn-secondary btn-sm" disabled={!pdf||page>=pdf.numPages} onClick={()=>setPage(page+1)}>Next</button></div><ResourceErrorState error={error}/>{loading&&<p role="status">Rendering PDF...</p>}<div ref={container} className="repository-pdf-canvas"><canvas ref={canvas} aria-label={`PDF Page ${page}`} hidden={!!error}/></div></div>;
}
