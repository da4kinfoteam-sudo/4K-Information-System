import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRepositoryBrowserFixture} from './resources-repository-fixture.mjs';
const require=createRequire(import.meta.url),Zip=require('jszip'),XLSX=require('sheetjs-preview');
const {chromium}=require(path.join(process.env.PLAYWRIGHT_NODE_MODULES||'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright'));
const output=await mkdtemp(path.join(tmpdir(),'4kis-repository-ui-')),serve=process.argv.includes('--serve');
const fixture=await createRepositoryBrowserFixture(output,{port:serve?Number(process.env.PORT||3037):0}),{db,url,drive}=fixture;
let browser,page,passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const root={id:1,username:'root',password:'fixture-password',fullName:'System Administrator',role:'Super Admin',operatingUnit:'NPMO'},user={id:2,username:'region1',password:'fixture-password',fullName:'Region One',role:'User',operatingUnit:'RPMO 1'},other={id:3,username:'region2',password:'fixture-password',fullName:'Region Two',role:'User',operatingUnit:'RPMO 2'};
function pdf(){
    const stream='BT /F1 24 Tf 72 720 Td (Signed Official Report) Tj ET',objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let text='%PDF-1.4\n',offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(text));text+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(text);text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(text);
}
async function docx(){
    const zip=new Zip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Signed Official Report</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>OU</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>RPMO 1</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:hyperlink r:id="external"><w:r><w:t>External Link</w:t></w:r></w:hyperlink></w:p></w:body></w:document>');
    zip.file('word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="external" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" TargetMode="External" Target="https://attacker.example.test/exfiltrate"/></Relationships>');return zip.generateAsync({type:'nodebuffer'});
}
try{
    if(serve){console.log('Sample-only repository preview with disposable SQL and simulated Drive: '+url);await new Promise(()=>{});}
    browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);
    const errors=[],external=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});page.on('request',request=>{if(request.url().startsWith('https://attacker.'))external.push(request.url());});await page.route('https://**',route=>route.abort());await page.goto(url);await page.getByText('No records found.',{exact:true}).waitFor();
    let entryId;
    await check('administrator creates an explicit assigned required folder then publishes it',async()=>{
        await page.getByRole('button',{name:'Create Folder',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('textbox',{name:'Subject',exact:true}).fill('Signed Quarterly Report');
        await modal.getByRole('checkbox',{name:'Required Submission',exact:true}).check();await modal.getByRole('checkbox',{name:'Include In Awards',exact:true}).check();await modal.getByRole('combobox',{name:'Quarter',exact:true}).selectOption('Q4');await modal.getByLabel('Deadline',{exact:true}).fill('2026-11-19');
        await modal.getByRole('group',{name:'Assigned OUs',exact:true}).getByRole('checkbox',{name:'RPMO 1',exact:true}).check();await modal.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('heading',{name:'Signed Quarterly Report',exact:true}).waitFor();
        entryId=(await db.query("select id from repository_entries where subject='Signed Quarterly Report'")).rows[0].id;await page.getByRole('button',{name:'Publish',exact:true}).click();await page.getByRole('button',{name:'Close Submissions',exact:true}).waitFor();
        assert.equal((await db.query('select count(*)::int count from repository_assignments where entry_id=$1',[entryId])).rows[0].count,1);
        await page.evaluate(user=>window.identity(user),user);await page.getByRole('heading',{name:'OU Submissions',exact:true}).waitFor();
    });
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
    const jpeg=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=40;canvas.height=40;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,40,40);return canvas.toDataURL('image/jpeg').split(',')[1];}),'base64');
    const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['Official Worksheet',''],['OU','RPMO 1'],['Formula Result',4],['Unsafe Text','<img src="https://attacker.example.test/picture" onerror="alert(1)">']]);sheet.B3={t:'n',f:'2+2',v:4};sheet['!merges']=[{s:{r:0,c:0},e:{r:0,c:1}}];XLSX.utils.book_append_sheet(workbook,sheet,'Report');
    const uploads=[{name:'signed.pdf',mimeType:'application/pdf',buffer:pdf()},{name:'signed.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await docx()},{name:'signed.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})},{name:'signed.xls',mimeType:'application/vnd.ms-excel',buffer:XLSX.write(workbook,{type:'buffer',bookType:'biff8'})},{name:'signed.png',mimeType:'image/png',buffer:png},{name:'signed.jpg',mimeType:'image/jpeg',buffer:jpeg},{name:'signed.jpeg',mimeType:'image/jpeg',buffer:jpeg}];
    await check('all supported formats upload through resumable storage without becoming submission credit',async()=>{
        await page.getByRole('button',{name:'View',exact:true}).click();const submission=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'RPMO 1 Submission',exact:true})});
        await submission.getByRole('button',{name:'Upload Files',exact:true}).click();const modal=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Upload Files',exact:true})});await modal.locator('input[type=file]').setInputFiles(uploads);drive.loseNextFinalResponse();
        await modal.getByRole('button',{name:'Upload',exact:true}).click();await modal.getByRole('button',{name:'Done',exact:true}).waitFor();assert.equal((await db.query("select count(*)::int count from repository_files where storage_state='Ready'")).rows[0].count,7);
        assert.equal((await db.query('select count(*)::int count from repository_submission_versions')).rows[0].count,0);await modal.getByRole('button',{name:'Done',exact:true}).click();
        assert(await submission.getByRole('button',{name:'Submit',exact:true}).isDisabled());await submission.locator('footer').getByRole('button',{name:'Close',exact:true}).click();
    });
    await check('cross-OU readers cannot see draft file contents and explicit signed Submit creates one late receipt',async()=>{
        await page.evaluate(other=>window.identity(other),other);await page.getByRole('button',{name:'View',exact:true}).click();const modal=page.getByRole('dialog');assert.equal(await modal.getByRole('link',{name:'signed.pdf',exact:true}).count(),0);assert.equal(await modal.getByRole('button',{name:'Upload Files',exact:true}).count(),0);await modal.locator('footer').getByRole('button',{name:'Close',exact:true}).click();
        await page.evaluate(user=>window.identity(user),user);await page.getByRole('button',{name:'View',exact:true}).click();const submission=page.getByRole('dialog');for(const file of uploads)await submission.getByRole('checkbox',{name:'Select '+file.name,exact:true}).check();
        await submission.getByRole('checkbox',{name:'The required signed documents are included.',exact:true}).check();await submission.getByRole('button',{name:'Submit',exact:true}).click();await submission.getByText('Submitted',{exact:true}).last().waitFor();
        assert.equal((await db.query('select count(*)::int count from repository_submission_versions')).rows[0].count,1);const live=(await db.query("select resource_reportorial_live(2026,'Q4',clock_timestamp()) value")).rows[0].value;assert.equal(live.rows[0].credited_units,.5);await submission.locator('footer').getByRole('button',{name:'Close',exact:true}).click();
    });
    await check('authorized cross-OU readers preview every format and originals retain exact bytes',async()=>{
        await page.evaluate(other=>window.identity(other),other);await page.getByRole('button',{name:'View',exact:true}).click();await page.getByRole('link',{name:'signed.pdf',exact:true}).waitFor();
        const records=(await db.query('select id,file_name,sha256 from repository_files order by file_name')).rows;
        for(const file of uploads){
            const record=records.find(row=>row.file_name===file.name);await page.goto(url+`#/documentary-repository/file?id=${entryId}&fileId=${record.id}`);await page.evaluate(other=>window.identity(other),other);await page.getByRole('heading',{name:file.name,exact:true}).waitFor();
            if(file.name.endsWith('.docx')){const frame=page.frameLocator('iframe');await frame.getByText('Signed Official Report',{exact:true}).waitFor();assert.equal(await frame.locator('a[href],script,iframe,object').count(),0);assert.equal(await page.locator('iframe').getAttribute('sandbox'),'');}
            else if(/\.xls[x]?$/.test(file.name)){const frame=page.frameLocator('iframe');await frame.getByText('Official Worksheet',{exact:true}).waitFor();assert.equal(await frame.locator('td[colspan="2"]').count(),1);assert.equal(await frame.locator('img,script,a[href]').count(),0);assert(await frame.getByText('4',{exact:true}).count());}
            else if(file.name.endsWith('.pdf'))await page.waitForFunction(()=>{const canvas=document.querySelector('canvas[aria-label="PDF Page 1"]');if(!canvas||!canvas.width)return false;const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>0&&data[i]<200&&data[i+1]<200&&data[i+2]<200)count++;return count>100;});
            else await page.waitForFunction(()=>{const img=document.querySelector('.repository-preview-image');return img&&img.complete&&img.naturalWidth>0;});
            const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download Original',exact:true}).click();const original=await downloaded;assert.equal(original.suggestedFilename(),file.name);const stream=await original.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert(Buffer.concat(chunks).equals(Buffer.from(file.buffer)),file.name+' original bytes changed');
            await page.screenshot({path:path.join(output,file.name.replace('.','-')+'.png'),fullPage:true});
        }
        assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    });
    await check('published deadline impact is previewed and Cancel preserves data while confirmed edits are audited',async()=>{
        await page.goto(url+`#/documentary-repository/detail?id=${entryId}`);await page.evaluate(root=>window.identity(root),root);await page.getByRole('button',{name:'Edit Details',exact:true}).click();let modal=page.getByRole('dialog');
        assert(await modal.getByRole('spinbutton',{name:'Reporting Year',exact:true}).isDisabled());assert(await modal.getByRole('checkbox',{name:'Include In Awards',exact:true}).isDisabled());
        await modal.getByLabel('Deadline',{exact:true}).fill(new Date(Date.now()+2*86400000).toISOString().slice(0,10));await modal.getByRole('cell',{name:'100%',exact:true}).waitFor();await modal.getByRole('button',{name:'Cancel',exact:true}).click();
        assert.match((await db.query('select due_at::text from repository_entries where id=$1',[entryId])).rows[0].due_at,/2026-11-19/);
        await page.getByRole('button',{name:'Edit Details',exact:true}).click();modal=page.getByRole('dialog');await modal.getByLabel('Deadline',{exact:true}).fill('2026-11-18');await modal.getByRole('textbox',{name:'Reason For Change',exact:true}).fill('Correct the published deadline.');await modal.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
        assert.match((await db.query('select due_at::text from repository_entries where id=$1',[entryId])).rows[0].due_at,/2026-11-18/);assert.equal((await db.query('select count(*)::int count from repository_entry_revisions where entry_id=$1',[entryId])).rows[0].count,3);
    });
    await check('administrator returns a version then the owner corrects it without overwriting any original',async()=>{
        await page.getByRole('button',{name:'View',exact:true}).click();let modal=page.getByRole('dialog');await modal.getByText('Submission History',{exact:true}).click();await modal.getByRole('button',{name:'Return',exact:true}).click();
        const correction=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Return For Correction',exact:true})});await correction.getByRole('textbox',{name:'Reason',exact:true}).fill('Verify signed page.');await correction.getByRole('button',{name:'Confirm',exact:true}).click();
        await modal.getByText('Returned For Correction',{exact:true}).waitFor();await modal.locator('footer').getByRole('button',{name:'Close',exact:true}).click();
        await page.evaluate(user=>window.identity(user),user);await page.getByRole('button',{name:'View',exact:true}).click();modal=page.getByRole('dialog');await modal.getByRole('checkbox',{name:'The required signed documents are included.',exact:true}).check();await modal.getByRole('button',{name:'Submit',exact:true}).click();
        await modal.getByText('Submitted',{exact:true}).last().waitFor();assert.equal((await db.query('select count(*)::int count from repository_submission_versions')).rows[0].count,2);assert.equal((await db.query("select count(*)::int count from repository_files where storage_state='Ready'")).rows[0].count,7);await modal.locator('footer').getByRole('button',{name:'Close',exact:true}).click();
    });
    await check('reasoned waiver restoration closure and reopening preserve receipts and files',async()=>{
        await page.evaluate(root=>window.identity(root),root);
        for(const [button,title] of [['Waive','Waive Assignment'],['Restore','Restore Assignment'],['Close Submissions','Close Submissions'],['Reopen','Reopen Entry']]){
            await page.getByRole('button',{name:button,exact:true}).click();const modal=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:title,exact:true})});await modal.getByRole('textbox',{name:'Reason',exact:true}).fill('Disposable workflow verification.');await modal.getByRole('button',{name:'Confirm',exact:true}).click();await modal.waitFor({state:'hidden'});
            await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
            if(button==='Waive')assert.equal((await db.query('select waived from repository_assignments where entry_id=$1',[entryId])).rows[0].waived,true);
            if(button==='Close Submissions'){
                await page.evaluate(user=>window.identity(user),user);await page.getByRole('button',{name:'View',exact:true}).click();const view=page.getByRole('dialog');assert.equal(await view.getByRole('button',{name:'Upload Files',exact:true}).count(),0);assert.equal(await view.getByRole('button',{name:'Submit',exact:true}).count(),0);await view.locator('footer').getByRole('button',{name:'Close',exact:true}).click();await page.evaluate(root=>window.identity(root),root);
            }
        }
        assert.equal((await db.query('select count(*)::int count from repository_submission_versions')).rows[0].count,2);assert.equal(drive.calls.filter(call=>call.method==='DELETE').length,0);
    });
    await check('normal folders have independently identified child folders and standalone official files require upload before publication',async()=>{
        await page.goto(url+'#/documentary-repository');await page.getByRole('button',{name:'Create Folder',exact:true}).click();let modal=page.getByRole('dialog');await modal.getByRole('textbox',{name:'Subject',exact:true}).fill('Official Memos');await modal.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Publish',exact:true}).click();await page.getByRole('button',{name:'Close Submissions',exact:true}).waitFor();
        const parentId=(await db.query("select id from repository_entries where subject='Official Memos'")).rows[0].id;
        await page.getByRole('button',{name:'Create Folder',exact:true}).click();modal=page.getByRole('dialog');await modal.getByRole('textbox',{name:'Subject',exact:true}).fill('Field Memos');await modal.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Publish',exact:true}).click();await page.getByRole('button',{name:'Close Submissions',exact:true}).waitFor();assert.equal((await db.query("select parent_id from repository_entries where subject='Field Memos'")).rows[0].parent_id,parentId);
        await page.goto(url+'#/documentary-repository');await page.getByRole('button',{name:'Upload File',exact:true}).click();await page.getByRole('textbox',{name:'Subject',exact:true}).fill('Official Memorandum 01');await page.getByRole('checkbox',{name:'All Authorized OUs',exact:true}).uncheck();await page.getByRole('group',{name:'Audience',exact:true}).getByRole('checkbox',{name:'RPMO 1',exact:true}).check();await page.locator('input[type=file]').setInputFiles([uploads[0]]);await page.getByRole('button',{name:'Upload',exact:true}).click();await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();await page.getByRole('button',{name:'Publish',exact:true}).click();await page.getByText('Published',{exact:true}).waitFor();
        const officialId=(await db.query("select id from repository_entries where subject='Official Memorandum 01'")).rows[0].id;await page.evaluate(other=>window.identity(other),other);await page.getByRole('alert').filter({hasText:'Access denied'}).waitFor();assert.equal(await page.getByRole('link',{name:'signed.pdf',exact:true}).count(),0);
        await page.evaluate(user=>window.identity(user),user);await page.getByRole('button',{name:'Download Original',exact:true}).waitFor();assert(page.url().includes(officialId));
    });
    await check('repository and submission dialogs stay within desktop tablet and mobile bounds with single-line table cells',async()=>{
        await page.goto(url+`#/documentary-repository/detail?id=${entryId}`);await page.evaluate(user=>window.identity(user),user);
        for(const width of [1440,820,390,320]){
            await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'View',exact:true}).waitFor();await page.screenshot({path:path.join(output,`repository-detail-${width}.png`),fullPage:true});
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            await page.getByRole('button',{name:'View',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('checkbox',{name:'The required signed documents are included.',exact:true}).waitFor();await page.screenshot({path:path.join(output,`submission-${width}.png`),fullPage:true});
            const metrics=await modal.evaluate(node=>({width:node.getBoundingClientRect().width,overflow:node.scrollWidth>node.clientWidth+1,wrap:[...node.querySelectorAll('th,td')].every(cell=>getComputedStyle(cell).whiteSpace==='nowrap')}));assert(metrics.width<=width);assert(!metrics.overflow);assert(metrics.wrap);await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
        }
        assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    });
    console.log(`${passed} repository browser checks passed through protected SQL and simulated Drive. Screenshots: ${output}`);
}catch(error){if(page){console.error('Failure page:',await page.locator('body').innerText());await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error('Failure screenshot:',path.join(output,'failure.png'));}throw error;}
finally{await browser?.close();await fixture.close();}
