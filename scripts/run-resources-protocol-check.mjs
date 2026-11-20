import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createResourcesHandler } from '../supabase/functions/_shared/resourcesHttp.ts';
import { RESOURCE_CHUNK_BYTES, RESOURCE_MAX_FILE_BYTES, resourceFilePolicy, validateResourceBytes, resourceBody, resourceOfficeDirectory } from '../supabase/functions/_shared/resourcesProtocol.ts';
const require=createRequire(import.meta.url);
const Zip=require('jszip');
let checks=0;
const check=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
await check('all seven extensions map to specific MIME types with bounded size',()=>{
    for(const extension of ['docx','xlsx','xls','pdf','jpg','jpeg','png']) assert(resourceFilePolicy('upload.'+extension,1,'').mime);
    for(const [name,size,mime] of [['a.doc',12,''],['a.pdf',0,''],['a.pdf',RESOURCE_MAX_FILE_BYTES+1,''],['a.pdf',12,'image/png'],['../a.pdf',12,'']]) assert.throws(()=>resourceFilePolicy(name,size,mime));
    assert.equal(RESOURCE_CHUNK_BYTES % (256*1024),0);
});
await check('PDF image and binary Excel signatures cannot be replaced with disguised HTML',()=>{
    for(const [name,bytes] of [['a.pdf',Buffer.from('%PDF-1.7')],['a.jpg',new Uint8Array([255,216,255,0])],['a.png',new Uint8Array([137,80,78,71,13,10,26,10])],['a.xls',new Uint8Array([208,207,17,224,161,177,26,225])]]) assert(validateResourceBytes(name,'',bytes));
    assert.throws(()=>validateResourceBytes('a.pdf','application/pdf',Buffer.from('<script>alert(1)</script>')));
});
await check('Office package directories verify document type and reject macros damaged archives and expansion bombs',async()=>{
    for(const [extension,part] of [['docx','word/document.xml'],['xlsx','xl/workbook.xml']]) {
        const zip=new Zip();zip.file('[Content_Types].xml','<Types/>');zip.file(part,'<document/>');
        const good=await zip.generateAsync({type:'uint8array'});assert(validateResourceBytes('a.'+extension,'',good));
        assert.throws(()=>validateResourceBytes('a.'+(extension==='docx'?'xlsx':'docx'),'',good));
        zip.file('word/vbaProject.bin','active content');const macro=await zip.generateAsync({type:'uint8array'});assert.throws(()=>resourceOfficeDirectory(macro));
    }
    const zip=new Zip();zip.file('part','small');const bytes=await zip.generateAsync({type:'uint8array'});
    const marker=Buffer.from(bytes).indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));new DataView(bytes.buffer).setUint32(marker+24,50*1024*1024,true);
    assert.throws(()=>resourceOfficeDirectory(bytes),/oversized/);
    assert.throws(()=>resourceOfficeDirectory(new Uint8Array(100)),/ZIP/);
});
await check('body limits apply to actual streamed bytes not only Content-Length',async()=>{
    const request=new Request('https://example.test',{method:'POST',body:'a'.repeat(17)});
    await assert.rejects(()=>resourceBody(request,16),/large/);
    assert.equal((await resourceBody(new Request('https://example.test',{method:'POST',body:'abc'}),16)).length,3);
});
await check('gateway rejects unsafe origin method malformed JSON and unexpected actions without touching RPC',async()=>{
    let calls=0;const handler=createResourcesHandler({origins:['https://allowed.test'],rpc:async()=>{calls++;throw {code:'XX000',message:'secret table or credential'};}});
    assert.equal((await handler(new Request('https://example.test',{method:'GET'}))).status,405);
    assert.equal((await handler(new Request('https://example.test',{method:'OPTIONS',headers:{origin:'https://wrong.test'}}))).status,403);
    assert.equal((await handler(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:'{bad'}))).status,400);
    assert.equal(calls,0);
    const response=await handler(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'session_start',identifier:'fixture',password:'fixture'})}));
    assert.equal(response.status,503);assert(!(await response.text()).includes('secret'));
});
console.log(`${checks} Resources protocol checks passed. No external service called.`);
