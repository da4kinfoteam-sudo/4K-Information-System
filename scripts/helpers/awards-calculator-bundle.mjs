import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const root=fileURLToPath(new URL('../../',import.meta.url));
export async function bundleAwardsCalculator({source,entry='lib/awardCapturedCalculation.ts'}={}){
    const result=await build({absWorkingDir:root,...(source?{stdin:{contents:source,resolveDir:path.join(root,'lib'),loader:'ts',sourcefile:'awardRankings-baseline.ts'}}:{entryPoints:[entry]}),
        bundle:true,write:false,platform:'neutral',format:'esm',target:'es2022',metafile:true,treeShaking:true,
        define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},mainFields:['module','main'],
        plugins:[{name:'awards-no-network',setup(builder){
            builder.onResolve({filter:/supabaseClient(?:\.ts)?$/},()=>({path:'no-network',namespace:'awards'}));
            builder.onLoad({filter:/.*/,namespace:'awards'},()=>({contents:'export const supabase = null;',loader:'js'}));
        }}]});
    const hash=createHash('sha256'),inputs=Object.keys(result.metafile.inputs).sort();
    for(const filename of inputs){hash.update(filename);hash.update(filename.endsWith('awardRankings-baseline.ts')||filename==='<stdin>'?source:filename.startsWith('awards:')?'export const supabase = null;':filename.startsWith('<define:')?filename:await readFile(path.resolve(root,filename)));}
    hash.update(await readFile(fileURLToPath(import.meta.url)));
    return {code:result.outputFiles[0].text,sourceHash:hash.digest('hex'),inputs};
}
