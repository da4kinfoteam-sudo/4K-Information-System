import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRepositoryBrowserFixture} from './resources-repository-fixture.mjs';
import {seedReportorialAwards} from './resources-awards-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.PLAYWRIGHT_NODE_MODULES||'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright')),XLSX=require('xlsx');
const output=await mkdtemp(path.join(tmpdir(),'4kis-resources-awards-ui-')),fixture=await createRepositoryBrowserFixture(output,{awards:true}),seed=await seedReportorialAwards(fixture.db,fixture.rpc);
let browser,page,passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
try{
    browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack);});await page.route('https://**',route=>route.abort());await page.goto(fixture.url);
    const inputs=()=>page.locator('.award-reportorial-inputs'),q3=()=>inputs().locator('tbody tr').filter({has:page.getByRole('cell',{name:'Q3',exact:true})});
    const openChange=async(name)=>{await q3().getByRole('button',{name,exact:true}).click();return page.getByRole('dialog');};
    const physical=()=>page.locator('.award-detail-panel tbody tr').filter({has:page.getByRole('cell',{name:'Program Management',exact:true})}).filter({has:page.getByRole('cell',{name:'RPMO 1',exact:true})});
    await check('actual Awards starts Manual and legacy inputs are independent of repository evidence',async()=>{
        await page.getByRole('heading',{name:'Reportorial Inputs',exact:true}).waitFor();assert.equal(await inputs().locator('tbody tr').count(),4);assert.equal(await q3().getByRole('cell',{name:'Manual',exact:true}).count(),2);
        await page.getByRole('button',{name:'Physical Details',exact:true}).click();await page.locator('.award-detail-controls').getByRole('button',{name:'Q3',exact:true}).click();assert.equal(await physical().locator('td').nth(11).innerText(),'4 / 5');assert.equal(await physical().locator('td').nth(4).innerText(),'0.00');
    });
    await check('source change is explicit reasoned and Cancel preserves Manual; confirmed Repository uses 1.5 credited units',async()=>{
        let dialog=await openChange('Change Source');await dialog.getByLabel('Source',{exact:true}).selectOption('Repository');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await seed.read()).periods[2].source,'Manual');
        dialog=await openChange('Change Source');await dialog.getByLabel('Source',{exact:true}).selectOption('Repository');await dialog.getByLabel('Reason',{exact:true}).fill('Activate disposable repository period');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await q3().getByRole('cell',{name:'Repository',exact:true}).waitFor();
        assert.equal(await physical().locator('td').nth(11).innerText(),'2 / 3');assert.equal(await physical().locator('td').nth(15).innerText(),'1.5');assert.equal(await physical().locator('td').nth(16).innerText(),'50.0%');assert.equal(await physical().locator('td').nth(4).innerText(),'6.00');
    });
    await check('controller keeps reportorial fields read-only without altering stored manual counts or national attendance editing',async()=>{
        await page.getByRole('button',{name:'Award Controller',exact:true}).click();await page.locator('.award-manual-controller__tabs').getByRole('button',{name:'Q3',exact:true}).click();const row=page.locator('.award-manual-table tbody tr').filter({has:page.getByRole('cell',{name:'RPMO 1',exact:true})});
        assert.equal(await row.locator('td').nth(1).locator('input').count(),0);assert.equal(await row.locator('td').nth(1).innerText(),'3');assert.equal(await row.locator('td').nth(2).innerText(),'2');
        await row.locator('td').nth(4).locator('input').fill('2');await page.locator('#award-controller').getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Awards controller saved.',{exact:true}).waitFor();const writes=await page.evaluate(()=>window.fixture.writes),saved=writes.find(row=>row.table==='award_manual_scores').rows.find(row=>row.period==='Q3'&&row.operating_unit==='RPMO 1');assert.equal(saved.reportorial_required,5);assert.equal(saved.reportorial_submitted,4);assert.equal(saved.national_activities_attended,2);
        await page.getByRole('button',{name:'Award Controller',exact:true}).click();
    });
    await check('evidence drilldown and Excel contain the same fractional totals and exact requirement destinations',async()=>{
        await q3().getByRole('button',{name:'View Evidence',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('link',{name:'On-Time Report',exact:true}).waitFor();assert.match(await dialog.getByRole('link',{name:'On-Time Report',exact:true}).getAttribute('href'),/source=dashboard&sourceView=awards-rankings/);assert.equal(await dialog.getByRole('cell',{name:'Late (50%)',exact:true}).count(),1);await dialog.locator('footer').getByRole('button',{name:'Close',exact:true}).click();
        const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:true}).click();const download=await downloadPromise,destination=path.join(output,download.suggestedFilename());await download.saveAs(destination);const wb=XLSX.readFile(destination),rows=XLSX.utils.sheet_to_json(wb.Sheets['Reportorial Inputs']);assert.equal(rows[0]['Credited Units'],1.5);assert.equal(rows[0]['Compliance (%)'],50);assert.equal(rows[0].Source,'Repository');assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['Reportorial Evidence']).length,3);
    });
    await check('finalize retains evidence after correction and reasoned reopen creates provisional new inputs',async()=>{
        let dialog=await openChange('Finalize');await dialog.getByLabel('Reason',{exact:true}).fill('Freeze disposable inputs');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await q3().getByRole('cell',{name:'Finalized',exact:true}).waitFor();assert.equal(await q3().getByRole('button',{name:'Change Source',exact:true}).count(),0);
        await seed.mutate('submission_return',{receipt_id:seed.lateReceipt,reason:'Invalid test document'},1);await page.getByRole('button',{name:'Refresh Reportorial Inputs',exact:true}).click();await q3().getByRole('cell',{name:'Finalized',exact:true}).waitFor();assert.equal(await physical().locator('td').nth(15).innerText(),'1.5');
        dialog=await openChange('Reopen');await dialog.getByLabel('Reason',{exact:true}).fill('Recompute corrected receipt');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await q3().getByRole('cell',{name:'Provisional',exact:true}).waitFor();assert.equal(await physical().locator('td').nth(15).innerText(),'1');assert.equal((await fixture.db.query('select count(*)::int n from reportorial_snapshots')).rows[0].n,1);
    });
    await check('failed summary loads never render zero or manual fallback and retry restores verified inputs',async()=>{
        await page.route('**/functions/v1/resources',async route=>{if(route.request().postDataJSON().resource==='reportorial')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic reportorial outage'})});return route.continue();});await page.getByRole('button',{name:'Refresh Reportorial Inputs',exact:true}).click();await page.getByRole('alert').filter({hasText:'Synthetic reportorial outage'}).waitFor();assert.equal(await page.locator('.award-quarter-list').count(),0);assert.equal(await page.getByRole('button',{name:'Export',exact:true}).count(),0);await page.unroute('**/functions/v1/resources');await page.getByRole('button',{name:'Retry',exact:true}).click();await q3().getByRole('cell',{name:'Provisional',exact:true}).waitFor();
    });
    await check('desktop tablet and phone layouts keep reportorial controls and modal inside the viewport',async()=>{
        for(const width of [1440,820,390,320]){await page.setViewportSize({width,height:900});await inputs().scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,`awards-${width}.png`)});await q3().getByRole('button',{name:'View Evidence',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('link',{name:'On-Time Report',exact:true}).waitFor();const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width);await page.screenshot({path:path.join(output,`evidence-${width}.png`)});await dialog.locator('footer').getByRole('button',{name:'Close',exact:true}).click();}assert.deepEqual(errors,[]);
    });
    console.log(`${passed} actual Awards Repository integration UI checks passed. ${output}`);
}catch(error){if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error(output);}throw error;}
finally{await browser?.close();await fixture.close();}
