import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createLodDashboardFixture} from './lod-dashboard-browser-fixture.mjs';

const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.PLAYWRIGHT_NODE_MODULES||'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright')),ExcelJS=require('exceljs');
const output=await mkdtemp(path.join(tmpdir(),'4kis-lod-dashboard-ui-')),serve=process.argv.includes('--serve'),fixture=await createLodDashboardFixture(output,{port:serve?Number(process.argv.at(-1))||3045:0});
let browser,page,passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
try{
    if(serve){console.log(JSON.stringify({url:fixture.url,pid:process.pid,output,environment:'synthetic-local-read-only'}));await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});}
    else{
        browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://**',route=>route.abort());await page.goto(fixture.url);
        const summary=()=>page.locator('.lod-summary-section'),detail=()=>page.locator('.lod-monitoring-card'),year=()=>page.getByLabel('Monitoring Assessment Year'),dialog=()=>page.getByRole('dialog',{name:'Download LOD Monitoring',exact:true});
        const total=async()=>Number((await summary().locator('tfoot td').last().innerText()).replaceAll(',',''));
        const waitReady=async()=>{await year().waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-label="Monitoring Assessment Year"]').disabled);};
        const openExport=async()=>{await summary().getByRole('button',{name:'Download XLSX',exact:true}).click();await dialog().waitFor();};
        const download=async label=>{const waiting=page.waitForEvent('download');await dialog().getByRole('button',{name:'Download XLSX',exact:true}).click();const file=await waiting,destination=path.join(output,label+'.xlsx');await file.saveAs(destination);await dialog().waitFor({state:'hidden'});const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(destination);return {wb,destination};};
        const verifyWorkbook=async(wb,ownOu)=>{
            for(const sheet of wb.worksheets){
                const year=Number(sheet.name.match(/\d{4}$/)[0]),expected=await page.evaluate(async({year,ownOu})=>{
                    const {getLodEffectiveState}=await import('/lib/lodScoring.ts'),{ouToRegionMap}=await import('/constants.tsx'),{parseLocation}=await import('/components/LocationPicker.tsx');
                    const reverse=new Map(Object.entries(ouToRegionMap).map(([ou,region])=>[region,ou])),groups=new Map(),seen=new Set();
                    for(const ipo of window.fixture.tables.ipos){
                        if(seen.has(ipo.id)||ownOu&&ipo.region!==ouToRegionMap[window.fixture.user.operatingUnit])continue;seen.add(ipo.id);
                        const group=ownOu?parseLocation(ipo.location||'').province||'Unspecified Province':reverse.get(ipo.region)||'Unassigned OU';
                        const assessment=window.fixture.tables.lod_assessments.filter(row=>row.ipo_id===ipo.id&&row.year===year).sort((a,b)=>b.id-a.id)[0],state=getLodEffectiveState(assessment),values=groups.get(group)||Array(9).fill(0),index=state.level!==null?state.level-1:state.kind==='dropped'?6:state.kind==='incomplete'?7:5;
                        values[index]++;values[8]++;groups.set(group,values);
                    }
                    const rows=[...groups].sort((a,b)=>a[0].localeCompare(b[0],'en',{numeric:true})).map(([name,values])=>[name,...values]),total=Array(9).fill(0);for(const row of rows)row.slice(1).forEach((value,index)=>total[index]+=value);return [...rows,['Total',...total]];
                },{year,ownOu});
                assert.deepEqual(Array.from({length:sheet.rowCount-6},(_,index)=>sheet.getRow(index+7).values.slice(1)),expected,'Each exported category must match the canonical LOD list state for its own year');
            }
        };
        const workbooks=[];
        await check('real LOD dashboard removes requested sections, retains other cards and counts only published Level 5',async()=>{
            await waitReady();assert.equal(await total(),520);assert.equal(await page.locator('.lod-kpi-card').count(),7);const high=page.locator('.lod-kpi-card').filter({has:page.getByText('High-Performing IPOs',{exact:true})});assert.equal(await high.locator('strong').innerText(),'3');assert.match(await high.innerText(),/At Level 5/);
            for(const name of ['LOD Average Score by Region','IPOs Ready for Scale-Up','Top Province','Top Provinces by Average LOD','IPOs by Progression Status'])assert.equal(await page.getByText(name,{exact:true}).count(),0);
            assert.equal(await summary().locator('thead th').first().innerText(),'Operating Unit');assert.equal(await summary().locator('thead th').count(),10);assert.equal(await page.getByRole('button',{name:'Edit Table',exact:true}).count(),0);
            assert(await summary().evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('.lod-monitoring-card'))&Node.DOCUMENT_POSITION_FOLLOWING)));
            assert.equal(await page.evaluate(()=>window.fixture.requests.filter(row=>row.table==='ipos').length),2,'IPO registry must page past 500');
        });
        await check('progression contains only Level 1–5 series and no zero average for unassessed years',async()=>{
            const chart=page.locator('.lod-chart-card').filter({has:page.getByRole('heading',{name:'LOD Progression Over Time',exact:true})});const legend=await chart.locator('.lod-chart-legend').innerText();assert.doesNotMatch(legend,/For Assessment|Incomplete|Dropped/);assert.equal(await chart.locator('.recharts-bar').count(),5);assert.doesNotMatch(await chart.locator('.recharts-xAxis').first().textContent(),/2024/);
        });
        await check('summary year and detailed search/state filters are independent with no new data requests',async()=>{
            const requests=await page.evaluate(()=>window.fixture.requests.length);await year().selectOption('2025');assert.equal(await page.locator('#lod-year-filter').inputValue(),'2026');assert.equal(await total(),520);
            await page.locator('#lod-level-filter').selectOption('5');await detail().getByPlaceholder('Search IPO...').fill('Manual');assert.equal(await detail().locator('tbody tr').count(),1);assert.equal(await total(),520);assert.equal(await page.evaluate(()=>window.fixture.requests.length),requests);
            await detail().getByPlaceholder('Search IPO...').fill('');await page.locator('#lod-level-filter').selectOption('All');await year().selectOption('2026');await page.locator('#lod-year-filter').selectOption('2025');await waitReady();await detail().getByRole('button',{name:'Organization With Component Scores',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.fixture.selected.at(-1)),{id:1,year:2025});assert.equal(await year().inputValue(),'2026');assert.equal(await total(),520);await page.locator('#lod-year-filter').selectOption('2026');await waitReady();
        });
        await check('diamond renders 50 percent maturity closer to center than 100 percent social services',async()=>{
            await page.locator('#lod-province-filter').selectOption('Benguet');const radar=page.getByRole('img',{name:/Component attainment:/});await radar.waitFor();assert.match(await radar.getAttribute('aria-label'),/Organizational Maturity 50.00%/);assert.match(await radar.getAttribute('aria-label'),/Basic Social Services 100.00%/);
            await page.waitForFunction(()=>{const d=document.querySelector('.lod-radar-chart-shell .recharts-radar-polygon path')?.getAttribute('d')||'',points=d.match(/-?\d+(?:\.\d+)?/g)?.map(Number);if(!points||points.length<8)return false;const cx=(points[0]+points[4])/2,cy=(points[3]+points[7])/2,om=Math.hypot(points[0]-cx,points[1]-cy),bss=Math.hypot(points[6]-cx,points[7]-cy);const grid=[...document.querySelectorAll('.lod-radar-chart-shell .recharts-polar-grid-concentric-polygon')].at(-1),outer=grid?.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number),radius=outer?Math.hypot(outer[0]-cx,outer[1]-cy):0;return radius>0&&bss/radius>.999&&Math.abs(om/bss-.5)<.001;});
            await radar.screenshot({path:path.join(output,'diamond-50-100.png')});const polygon=await radar.locator('.recharts-radar-polygon path').getAttribute('d');assert(polygon&&polygon.includes('L'));await writeFile(path.join(output,'diamond-path.txt'),polygon);const points=polygon.match(/-?\d+(?:\.\d+)?/g).map(Number),box=await radar.locator('.recharts-wrapper').boundingBox();await page.mouse.move(box.x+points[0],box.y+points[1]);await radar.getByText('50.00% (20.00 / 40.00)',{exact:true}).waitFor();await page.locator('#lod-province-filter').selectOption('All');
        });
        await check('mixed questionnaire versions use individual weights and manual-only levels do not invent component data',async()=>{
            await page.locator('#lod-year-filter').selectOption('All');await waitReady();await detail().getByRole('button',{name:'Earlier Assessment Only',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.fixture.selected.at(-1)),{id:7,year:2025});assert.match(await page.getByRole('img',{name:/Component attainment:/}).getAttribute('aria-label'),/Organizational Maturity 66.67%/);
            await page.locator('#lod-year-filter').selectOption('2026');await waitReady();await page.locator('#lod-province-filter').selectOption('Cagayan');assert.equal(await page.getByRole('img',{name:/Component attainment:/}).count(),0);assert.equal(await total(),1);await page.locator('#lod-province-filter').selectOption('All');
        });
        await check('single selected and all-year XLSX exports preserve complete tables, historical states and formatting',async()=>{
            const requests=await page.evaluate(()=>window.fixture.requests.length);
            await openExport();workbooks.push(await download('single-2026'));assert.equal(workbooks[0].wb.worksheets.length,1);assert.equal(workbooks[0].wb.worksheets[0].name,'LOD Monitoring 2026');
            await openExport();await dialog().getByRole('radio',{name:'Selected Years',exact:true}).check();await dialog().getByRole('checkbox',{name:'2026',exact:true}).uncheck();assert.equal(await dialog().getByRole('button',{name:'Download XLSX',exact:true}).isDisabled(),true);await dialog().getByRole('checkbox',{name:'2025',exact:true}).check();await dialog().getByRole('checkbox',{name:'2024',exact:true}).check();workbooks.push(await download('selected-2024-2025'));assert.deepEqual(workbooks[1].wb.worksheets.map(sheet=>sheet.name),['LOD Monitoring 2024','LOD Monitoring 2025']);
            await openExport();await dialog().getByRole('radio',{name:'All Years',exact:true}).check();workbooks.push(await download('all-years'));assert.equal(workbooks[2].wb.worksheets.length,3);
            for(const {wb}of workbooks)await verifyWorkbook(wb,false);
            for(const {wb}of workbooks)for(const sheet of wb.worksheets){assert.equal(sheet.views[0].showGridLines,false);assert.equal(sheet.getCell('A6').alignment.horizontal,'center');assert.equal(sheet.getCell('J6').border.bottom.style,'thin');assert.equal(sheet.getCell(sheet.rowCount,10).value,520);assert.equal(sheet.getCell('A6').value,'Operating Unit');assert.match(sheet.getCell('A4').value,/Extracted:/);for(let row=7;row<sheet.rowCount;row++)assert.equal(sheet.getRow(row).values.slice(2,10).reduce((sum,n)=>sum+n,0),sheet.getCell(row,10).value);}
            const old=workbooks[2].wb.getWorksheet('LOD Monitoring 2024');assert.equal(old.getCell(old.rowCount,8).value,1);assert.equal(old.getCell(old.rowCount,7).value,519);assert.equal(await page.evaluate(()=>window.fixture.requests.length),requests,'Export must reuse metadata, not download answers');
        });
        await check('failed export retains year choices for retry and the original detailed CSV still downloads',async()=>{
            await openExport();await dialog().getByRole('radio',{name:'Selected Years',exact:true}).check();await page.evaluate(()=>{window.savedObjectURL=URL.createObjectURL;URL.createObjectURL=()=>{throw new Error('Disposable export failure')};});await dialog().getByRole('button',{name:'Download XLSX',exact:true}).click();await dialog().getByRole('alert').waitFor();assert.equal(await dialog().getByRole('radio',{name:'Selected Years',exact:true}).isChecked(),true);await page.evaluate(()=>URL.createObjectURL=window.savedObjectURL);workbooks.push(await download('retry'));
            const waiting=page.waitForEvent('download');await detail().getByRole('button',{name:'Export',exact:true}).click();const file=await waiting;assert.match(file.suggestedFilename(),/\.csv$/);await file.saveAs(path.join(output,'detail.csv'));
        });
        await check('visibility capability rather than role controls province grouping, safe account changes and bounded pagination',async()=>{
            await page.evaluate(()=>window.changeIdentity('Own OU'));await waitReady();assert.equal(await summary().locator('thead th').first().innerText(),'Province');assert.equal(await total(),516);assert.equal(await summary().locator('tbody tr').count(),10);await summary().getByRole('combobox',{name:'Rows per page',exact:true}).selectOption('50');assert.equal(await summary().locator('tbody tr').count(),23);assert(await summary().locator('.lod-summary-scroll').evaluate(el=>el.scrollHeight>el.clientHeight&&el.clientHeight<=410));
            assert.equal(await summary().getByText('Unspecified Province',{exact:true}).count(),1);assert(await page.evaluate(()=>window.fixture.requests.some(row=>row.table==='ipos'&&row.filters.some(filter=>filter.key==='region'&&filter.value==='Region I (Ilocos Region)'))));
            await openExport();await dialog().getByRole('radio',{name:'All Years',exact:true}).check();const own=await download('own-ou-all-years');workbooks.push(own);await verifyWorkbook(own.wb,true);for(const sheet of own.wb.worksheets){assert.equal(sheet.getCell('A6').value,'Province');assert.equal(sheet.getCell(sheet.rowCount,10).value,516);assert(!sheet.getColumn(1).values.some(value=>value==='Cagayan'||value==='Isabela'));}
        });
        await check('summary and export dialog fit desktop tablet phone and short screens without overflow',async()=>{
            for(const width of [1440,820,390,320]){await page.setViewportSize({width,height:720});await summary().scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await summary().evaluate(el=>{const box=el.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth;}));await summary().screenshot({path:path.join(output,`summary-${width}.png`)});await openExport();await dialog().getByRole('radio',{name:'Selected Years',exact:true}).check();assert(await dialog().locator('.modal-card__body').evaluate(el=>el.scrollWidth<=el.clientWidth));await dialog().screenshot({path:path.join(output,`export-${width}.png`)});await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});}
        });
        await check('missing mappings empty data and read failure never expose stale All OU rows or permit invalid exports',async()=>{
            await page.evaluate(()=>window.changeIdentity('Own OU','UNMAPPED OU'));await page.getByText('Your operating unit is not mapped to an IPO region.',{exact:true}).waitFor();assert.equal(await page.locator('.lod-summary-section').count(),0);
            await page.evaluate(()=>window.changeIdentity('Own OU','NPMO'));await year().waitFor();assert.equal(await year().isDisabled(),true);assert.match(await summary().innerText(),/No assessment years available/);assert.equal(await summary().getByRole('button',{name:'Download XLSX',exact:true}).isDisabled(),true);
            await page.evaluate(()=>{window.fixture.mode='error';window.changeIdentity('All','RPMO 1')});await page.getByText('Disposable LOD read failure',{exact:true}).waitFor();assert.equal(await page.locator('.lod-summary-section').count(),0);assert.deepEqual(errors,[]);
        });
        await writeFile(path.join(output,'workbook-review.json'),JSON.stringify({files:workbooks.map(({wb,destination})=>({file:destination,sheets:wb.worksheets.map(sheet=>({name:sheet.name,columns:10,rows:sheet.rowCount}))})),errors},null,2));console.log(`${passed} actual LOD component/query/export UI checks passed. ${output}`);
    }
}catch(error){if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error(output);}throw error;}
finally{await browser?.close();await fixture.close();}
