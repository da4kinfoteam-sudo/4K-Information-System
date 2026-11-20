import { read, utils } from 'sheetjs-preview';
import type { ResourceSheet } from './resourceOfficePreview';
let source:ArrayBuffer|null=null;
self.onmessage=(event:MessageEvent<{bytes?:ArrayBuffer;sheet?:string}>)=>{
    try{
        if(event.data.bytes)source=event.data.bytes;
        if(!source)throw new Error('The spreadsheet is unavailable.');
        if(!event.data.sheet){const book=read(source,{bookSheets:true,bookProps:false,bookVBA:false});self.postMessage({names:book.SheetNames});return;}
        const book=read(source,{sheets:event.data.sheet,sheetRows:2001,cellHTML:false,cellFormula:false,cellStyles:false,bookVBA:false,bookDeps:false,cellNF:true});
        const sheet=book.Sheets[event.data.sheet];if(!sheet)throw new Error('The worksheet is unavailable.');
        const full=utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1'),rows:string[][]=[];
        const lastRow=Math.min(1999,full.e.r),lastColumn=Math.min(59,full.e.c);let characters=0,count=0,truncated=full.e.r>1999||full.e.c>59;
        for(let r=0;r<=lastRow;r++){
            const row:string[]=[];
            for(let c=0;c<=lastColumn;c++){
                if(++count>50000){truncated=true;break;}
                const cell=sheet[utils.encode_cell({r,c})];let text=cell?String(cell.w??utils.format_cell(cell)??cell.v??''):'';
                if(text.length>2000){text=text.slice(0,2000);truncated=true;}
                characters+=text.length;
                if(characters>2000000){truncated=true;break;}
                row.push(text);
            }
            if(row.length!==lastColumn+1)break;
            rows.push(row);
        }
        const merges=(sheet['!merges']||[]).filter(merge=>merge.s.r<rows.length&&merge.s.c<=lastColumn&&merge.e.r>=merge.s.r&&merge.e.c>=merge.s.c).map(merge=>({s:merge.s,e:{r:Math.min(rows.length-1,merge.e.r),c:Math.min(lastColumn,merge.e.c)}}));
        if(merges.length>5000)throw new Error('The worksheet has too many merged cells for an inline preview.');
        const result:ResourceSheet={name:event.data.sheet,rows,merges,truncated};self.postMessage({sheet:result});
    }catch(error){self.postMessage({error:error instanceof Error?error.message:'The spreadsheet could not be previewed.'});}
};
