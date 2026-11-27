import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRepositoryBrowserFixture} from './resources-repository-fixture.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || 'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const output = await mkdtemp(path.join(tmpdir(), '4kis-repository-refinement-'));
const fixture = await createRepositoryBrowserFixture(output, {port: process.argv.includes('--serve') ? Number(process.env.PORT || 3039) : 0, referenceHeaders: true});
const {db, url} = fixture;
let browser, page, passed = 0;
const check = async (name, run) => {await run(); passed++; console.log('PASS ' + name);};
const rowCount = async () => (await db.query('select count(*)::int n from repository_entries')).rows[0].n;
try {
    await db.exec(`insert into repository_entries(kind,subject,state,reporting_year,created_by_name,published_at,updated_at)
      select 'Folder','Review Document '||lpad(n::text,3,'0'),case when n%2=0 then 'Published' else 'Draft' end,2020+n%6,'Review User',clock_timestamp(),'2026-01-01'::timestamptz+n*interval '1 day' from generate_series(1,62) n`);
    if (process.argv.includes('--serve')) {console.log('Sample-only repository refinement preview: ' + url); await new Promise(() => {});}
    browser = await chromium.launch({channel: 'msedge', headless: true});
    page = await browser.newPage({viewport: {width: 1440, height: 900}}); page.setDefaultTimeout(15000);
    const errors = [], reads = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (request.url().endsWith('/functions/v1/resources')) {const body = request.postDataJSON(); if (body.action === 'read') reads.push(body);}});
    await page.route('https://**', route => route.abort());
    await page.addInitScript(() => {localStorage.setItem('repository-entry-columns:1', '[]'); localStorage.setItem('unrelated-preference', 'keep');});
    await page.goto(url); await page.getByRole('link', {name: 'Review Document 062', exact: true}).waitFor();
    const openHeader = async name => {await page.getByRole('button', {name: 'Filter and sort ' + name, exact: true}).click(); return page.getByRole('dialog', {name: 'Filter and sort ' + name, exact: true});};
    await check('fixed defaults ignore retired preferences with no Edit Table or standalone filters', async () => {
        assert.equal(await page.getByRole('button', {name: /Edit Table/}).count(), 0);
        assert.equal(await page.getByRole('combobox', {name: 'Document status'}).count(), 0);
        assert.equal(await page.getByRole('spinbutton', {name: 'Reporting year filter'}).count(), 0);
        assert.equal(await page.locator('.resources-table thead th').count(), 8);
        assert.equal(await page.getByRole('button', {name: 'Refresh documents', exact: true}).count(), 1);
        assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-preference')), 'keep');
    });
    await check('server choices reach beyond page one, filter all records and preserve draft cancellation', async () => {
        let menu = await openHeader('Subject');
        await menu.getByRole('checkbox', {name: 'Review Document 001', exact: true}).waitFor();
        assert.equal(await menu.getByRole('checkbox').count(), 50);
        await menu.getByRole('checkbox').first().focus(); await page.keyboard.press('ArrowDown');
        assert(await menu.getByRole('checkbox').nth(1).evaluate(node=>node===document.activeElement));
        await menu.getByRole('button', {name: 'Next', exact: true}).click(); await menu.getByRole('checkbox', {name: 'Review Document 062', exact: true}).waitFor();
        await menu.getByRole('button', {name: 'Clear', exact: true}).click();
        await menu.getByRole('checkbox', {name: 'Review Document 062', exact: true}).check(); await menu.getByRole('button', {name: 'Cancel', exact: true}).click();
        assert.equal(await page.locator('.resources-table tbody tr').count(), 10);
        menu = await openHeader('Subject'); await menu.getByRole('searchbox').fill('Review Document 001'); await menu.getByRole('checkbox', {name: 'Review Document 001', exact: true}).waitFor();
        await menu.getByRole('button', {name: 'Clear', exact: true}).click(); await menu.getByRole('checkbox', {name: 'Review Document 001', exact: true}).check(); await menu.getByRole('button', {name: 'Apply', exact: true}).click();
        await page.getByRole('link', {name: 'Review Document 001', exact: true}).waitFor(); assert.equal(await page.locator('.resources-table tbody tr').count(), 1);
        await page.getByRole('button', {name: 'Reset Filters', exact: true}).click(); await page.getByRole('link', {name: 'Review Document 062', exact: true}).waitFor();
        const before = reads.length; menu = await openHeader('Subject'); await menu.getByRole('checkbox').first().waitFor();
        await menu.getByRole('button', {name: 'Ascending', exact: true}).click(); await page.keyboard.press('Escape');
        assert.equal(await page.locator('th[aria-sort="descending"]').count(), 1);
        menu = await openHeader('Subject'); await menu.getByRole('button', {name: 'Ascending', exact: true}).click(); await menu.getByRole('button', {name: 'Apply', exact: true}).click();
        await page.getByRole('link', {name: 'Review Document 001', exact: true}).waitFor();
        assert(reads.slice(before).some(read => read.args?.sort_key === 'subject'));
    });
    await check('short-screen Create Folder scrolls fully while footer/title stay visible and bulk OU selection is independent', async () => {
        const before = await rowCount();
        for (const [width, height] of [[1366,600], [1024,480], [820,600], [390,667], [320,480]]) {
            await page.setViewportSize({width, height}); await page.getByRole('button', {name: 'Create Folder', exact: true}).click();
            const modal = page.getByRole('dialog', {name: 'Create Folder', exact: true});
            await modal.getByRole('textbox', {name: 'Subject', exact: true}).fill('Unsaved draft');
            await modal.getByRole('checkbox', {name: 'Required Submission', exact: true}).check();
            const assigned = modal.getByRole('group', {name: 'Assigned OUs', exact: true});
            await assigned.getByRole('checkbox', {name: 'Select all Assigned OUs', exact: true}).check();
            assert.equal(await assigned.getByRole('checkbox', {checked: true}).count(), 18);
            await assigned.getByRole('checkbox', {name: 'RPMO 1', exact: true}).uncheck();
            assert(await assigned.getByRole('checkbox', {name: 'Select all Assigned OUs', exact: true}).evaluate(node => node.indeterminate));
            await modal.getByRole('checkbox', {name: 'All Authorized OUs', exact: true}).uncheck();
            const audience = modal.getByRole('group', {name: 'Audience', exact: true});
            assert.equal(await audience.getByRole('checkbox', {checked: true}).count(), 0);
            await audience.getByRole('checkbox', {name: 'Select all Audience', exact: true}).check();
            assert.equal(await assigned.getByRole('checkbox', {name: 'RPMO 1', exact: true}).isChecked(), false);
            const metrics = await modal.evaluate(node => {
                const box = node.getBoundingClientRect(), body = node.querySelector('.modal-card__body'), footer = node.querySelector('footer').getBoundingClientRect(), heading = node.querySelector('header').getBoundingClientRect(), ou = node.querySelector('.repository-ou-scroll');
                body.scrollTop = body.scrollHeight;
                return {top: box.top, bottom: box.bottom, header: heading.top, footer: footer.bottom, scroll: body.scrollHeight > body.clientHeight && body.scrollTop > 0, ouScroll: ou.scrollHeight > ou.clientHeight, overflow: node.scrollWidth > node.clientWidth + 1, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1};
            });
            assert(metrics.top >= 0 && metrics.bottom <= height && metrics.header >= 0 && metrics.footer <= height, JSON.stringify(metrics));
            assert(metrics.scroll && metrics.ouScroll && !metrics.overflow && !metrics.pageOverflow, JSON.stringify(metrics));
            await page.screenshot({path: path.join(output, `folder-${width}-${height}.png`)});
            await modal.getByRole('button', {name: 'Cancel', exact: true}).click(); await modal.waitFor({state: 'hidden'});
        }
        assert.equal(await rowCount(), before);
    });
    await check('header menu compactness, focus, outside-dismissal and overflow match the real IPO header reference', async () => {
        await page.setViewportSize({width: 1440, height: 600});
        await page.evaluate(() => window.renderIpoReference()); await page.locator('#header-reference th').waitFor();
        const reference = await page.evaluate(() => {
            const holder = document.querySelector('#header-reference');
            const metric = node => {const css = getComputedStyle(node), button = node.querySelector('button'), b = getComputedStyle(button); return {height: node.getBoundingClientRect().height, font: css.fontFamily, size: css.fontSize, weight: css.fontWeight, line: css.lineHeight, button: {height: button.getBoundingClientRect().height, min: b.minHeight, size: b.fontSize, line: b.lineHeight, display: b.display, padding:b.padding, box:b.boxSizing},border:css.borderBottomWidth};};
            return {ipo: metric(holder.querySelector('th')), repository: metric(document.querySelector('.repository-table-section th'))};
        });
        assert.deepEqual(reference.repository, reference.ipo);
        await page.evaluate(() => window.removeIpoReference());
        for (const [width, height] of [[1440,600], [820,480], [390,667], [320,480]]) {
            await page.setViewportSize({width, height});
            const menu = await openHeader('Subject'); await menu.getByRole('checkbox').first().waitFor(); await menu.getByRole('searchbox').focus();
            const visibleChoice = await menu.evaluate(node => {const choice=node.querySelector('input[type=checkbox]').getBoundingClientRect(),body=node.querySelector('.ipo-column-filter__body').getBoundingClientRect();return choice.top>=body.top&&choice.bottom<=body.bottom;});
            assert(visibleChoice,'First choice is immediately visible without scrolling past menu controls');
            await page.screenshot({path:path.join(output, `header-top-${width}-${height}.png`)});
            const metrics = await menu.evaluate(node => {const r = node.getBoundingClientRect(), input = node.querySelector('input[type=search]'), style = getComputedStyle(input), f = node.querySelector('.ipo-list-menu-footer').getBoundingClientRect(), body=node.querySelector('.ipo-column-filter__body');body.scrollTop=body.scrollHeight;return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,footer:f.bottom,outline:style.outlineOffset,shadow:style.boxShadow,scroll:body.scrollTop>0};});
            assert(metrics.left >= 0 && metrics.right <= width && metrics.top >= 0 && metrics.bottom <= height && metrics.footer <= height, JSON.stringify(metrics));
            assert.equal(metrics.outline, '-2px'); assert.equal(metrics.shadow, 'none');
            assert(metrics.scroll, 'Long populated menus scroll without hiding their footer');
            await page.screenshot({path:path.join(output, `header-${width}-${height}.png`)});
            await menu.getByRole('button', {name: 'Descending', exact: true}).click();
            await page.mouse.click(2, 2); await menu.waitFor({state:'hidden'});
            assert.equal(await page.locator('th[aria-sort="ascending"]').count(),1);
        }
        assert.deepEqual(errors, []);
    });
    await check('published Edit Details scrolls and Select All preserves waived OUs and NULL audience on confirmed save', async () => {
        const id = (await db.query("insert into repository_entries(kind,subject,state,published_at,created_by_name,required_submission,reporting_year,due_at) values('Folder','Published Review Requirement','Published',clock_timestamp(),'Review User',true,2026,'2026-12-31') returning id")).rows[0].id;
        await db.query("insert into repository_assignments(entry_id,operating_unit,waived,waiver_reason) values($1,'RPMO 1',false,null),($1,'RPMO 2',true,'Existing waiver')", [id]);
        await page.goto(url + '#/documentary-repository/detail?id=' + id);
        for (const [width, height] of [[1366,600], [820,480], [390,667], [320,480]]) {
            await page.setViewportSize({width, height}); await page.getByRole('button', {name:'Edit Details',exact:true}).click();
            const modal = page.getByRole('dialog', {name:'Edit Details',exact:true});
            const assigned = modal.getByRole('group', {name:'Assigned OUs',exact:true});
            await assigned.getByRole('checkbox', {name:'RPMO 2',exact:true}).waitFor(); assert(await assigned.getByRole('checkbox', {name:'RPMO 2',exact:true}).isDisabled());
            await assigned.getByRole('checkbox', {name:'Select all Assigned OUs',exact:true}).check();
            assert.equal(await assigned.getByRole('checkbox', {name:'RPMO 2',exact:true}).isChecked(), false);
            await modal.getByRole('textbox', {name:'Reason For Change',exact:true}).fill('Explicit assignment update.');
            await modal.getByLabel('Deadline',{exact:true}).fill('2027-01-01'); await modal.locator('.repository-impact tbody tr').last().waitFor();
            const metrics = await modal.evaluate(node => {const body=node.querySelector('.modal-card__body');body.scrollTop=body.scrollHeight;return {scroll:body.scrollTop>0,bottom:node.querySelector('footer').getBoundingClientRect().bottom,overflow:node.scrollWidth>node.clientWidth+1,impactBottom:node.querySelector('.repository-impact').getBoundingClientRect().bottom,bodyBottom:body.getBoundingClientRect().bottom};});
            assert(metrics.scroll && metrics.bottom <= height && !metrics.overflow, JSON.stringify(metrics));
            assert(metrics.impactBottom <= metrics.bodyBottom+1, JSON.stringify(metrics));
            await page.screenshot({path:path.join(output, `edit-${width}-${height}.png`)});
            await modal.getByRole('button', {name:'Cancel',exact:true}).click();
        }
        await page.setViewportSize({width:1366,height:600}); await page.getByRole('button', {name:'Edit Details',exact:true}).click();
        const modal = page.getByRole('dialog', {name:'Edit Details',exact:true});
        await modal.getByRole('group', {name:'Assigned OUs',exact:true}).getByRole('checkbox', {name:'Select all Assigned OUs',exact:true}).check();
        await modal.getByRole('textbox', {name:'Reason For Change',exact:true}).fill('Assign other eligible OUs without restoring waiver.');
        await modal.getByRole('button', {name:'Save',exact:true}).click(); await modal.waitFor({state:'hidden'});
        const waived = (await db.query("select waived,waiver_reason from repository_assignments where entry_id=$1 and operating_unit='RPMO 2'", [id])).rows[0];
        assert.deepEqual(waived, {waived:true,waiver_reason:'Existing waiver'});
        assert.equal((await db.query('select audience_ous from repository_entries where id=$1', [id])).rows[0].audience_ous, null);
        assert.equal(await page.getByRole('button', {name:/Edit Table/}).count(), 0);
    });
    await check('embedded Folder Contents searches remain scoped with no column editor or hidden default columns', async () => {
        const parent = (await db.query("insert into repository_entries(kind,subject,state,published_at,created_by_name) values('Folder','Scope Parent','Published',clock_timestamp(),'Review User') returning id")).rows[0].id;
        await db.query("insert into repository_entries(kind,subject,state,parent_id,created_by_name) values('Folder','Unique Child Inside','Draft',$1,'Review User'),('Folder','Unique Child Outside','Draft',null,'Review User')", [parent]);
        await page.goto(url+'#/documentary-repository/detail?id='+parent);
        await page.getByRole('searchbox', {name:'Search documents',exact:true}).fill('Unique Child');
        await page.getByRole('link', {name:'Unique Child Inside',exact:true}).waitFor();
        assert.equal(await page.getByRole('link', {name:'Unique Child Outside',exact:true}).count(),0);
        const menu = await openHeader('Subject'); await menu.getByRole('checkbox', {name:'Unique Child Inside',exact:true}).waitFor();
        assert.equal(await menu.getByRole('checkbox', {name:'Unique Child Outside',exact:true}).count(),0); await page.keyboard.press('Escape');
        await page.getByText('History', {exact:true}).click(); await page.getByRole('columnheader', {name:'Reason',exact:true}).waitFor();
        assert.equal(await page.getByRole('button', {name:/Edit Table/}).count(),0);
        assert.deepEqual(errors,[]);
    });
    await check('root header choices discover a nested requirement even when no required folder is in the root result', async () => {
        const parent=(await db.query("select id from repository_entries where subject='Scope Parent'")).rows[0].id;
        await db.query("insert into repository_entries(kind,subject,parent_id,state,required_submission,reporting_year,due_at,created_by_name) values('Folder','Nested Draft Submission',$1,'Draft',true,2027,'2090-01-01','Review User')",[parent]);
        await page.goto(url+'#/documentary-repository');
        let menu=await openHeader('Status'); await menu.getByRole('checkbox',{name:'Draft',exact:true}).waitFor();
        await menu.getByRole('button',{name:'Clear',exact:true}).click();await menu.getByRole('checkbox',{name:'Draft',exact:true}).check();await menu.getByRole('button',{name:'Apply',exact:true}).click();
        await page.getByRole('link',{name:'Review Document 061',exact:true}).waitFor();
        assert.equal(await page.getByRole('link',{name:'Nested Draft Submission',exact:true}).count(),0);
        menu=await openHeader('Type');await menu.getByRole('checkbox',{name:'Required Folder',exact:true}).waitFor();
        await menu.getByRole('button',{name:'Clear',exact:true}).click();await menu.getByRole('checkbox',{name:'Required Folder',exact:true}).check();await menu.getByRole('button',{name:'Apply',exact:true}).click();
        await page.getByRole('link',{name:'Nested Draft Submission',exact:true}).waitFor();assert.equal(await page.locator('.resources-table tbody tr').count(),1);
    });
    await check('failed Create Folder save retains the draft and Cancel writes no business records', async () => {
        await page.goto(url+'#/documentary-repository'); await page.getByRole('button',{name:'Create Folder',exact:true}).click();
        const modal=page.getByRole('dialog',{name:'Create Folder',exact:true}), before=await rowCount();
        await modal.getByRole('textbox',{name:'Subject',exact:true}).fill('Retained failure draft');
        const fail=async route=>{if(route.request().postDataJSON()?.mutation==='entry_save')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary review outage'})});else await route.continue();};
        await page.route('**/functions/v1/resources',fail);
        await modal.getByRole('button',{name:'Save',exact:true}).click(); await modal.getByRole('alert').filter({hasText:'Temporary review outage'}).waitFor();
        assert.equal(await modal.getByRole('textbox',{name:'Subject',exact:true}).inputValue(),'Retained failure draft');
        assert.equal(await rowCount(),before); await modal.getByRole('button',{name:'Cancel',exact:true}).click();
        await page.unroute('**/functions/v1/resources',fail); assert.equal(await rowCount(),before);
    });
    console.log(`${passed} repository refinement browser checks passed. Screenshots: ${output}`);
} catch (error) {
    if (page) {console.error(await page.locator('body').innerText()); await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}); console.error('Screenshot:',path.join(output,'failure.png'));}
    throw error;
} finally {await browser?.close(); await fixture.close();}
