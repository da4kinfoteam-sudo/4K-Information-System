import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

// Disposable/local checks only. Never invoke migration/deployment CLIs or linked production SQL runners.
const suites=['resources-sql','repository-table','repository-refinement-ui','repository-storage-workflow','repository-document-ui','resources-protocol','resources-drive','resources-client','resources-ticket-ui','resources-repository-ui','resources-homepage-ui','resources-awards','awards-versioning','awards-source','awards-calculation','awards-gateway','awards-concurrency','resources-awards-ui','resources-navigation-ui','resources-concurrency','dashboard-scope','dashboard-scope-ui','lod-dashboard','lod-dashboard-ui','report-scope','report-scope-ui','drive-folder-identity','gad-pimme-movs','ipo-list-columns-ui','system-information','system-information-ui'];
const artifacts=await mkdtemp(path.join(tmpdir(),'4kis-resources-final-'));
async function sourceHashes(){
    const listing=spawnSync('git',['ls-files','-co','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true});assert.equal(listing.status,0,listing.stderr);
    const files=[...new Set(listing.stdout.split('\0').filter(file=>/\.(?:[cm]?[jt]sx?|sql|css|json|md)$/.test(file)))].sort();
    const hashes={};for(const file of files)hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');return hashes;
}
const before=await sourceHashes(),results=[];console.log('Evidence: '+artifacts);
for(const [name,args] of [...suites.map(name=>[name,['--experimental-strip-types',`scripts/run-${name}-check.mjs`]]),['awards-calculator-bundle',['scripts/build-awards-calculator.mjs','--check']],['lint',['node_modules/typescript/bin/tsc','--noEmit']],['build',['node_modules/vite/bin/vite.js','build']]]){
    const start=Date.now(),result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
    await writeFile(path.join(artifacts,name+'.log'),`${result.stdout||''}\n${result.stderr||''}`);
    results.push({name,exitCode:result.status,error:result.error?.message,seconds:(Date.now()-start)/1000});console.log(`${result.status===0?'PASS':'FAIL'} ${name} (${results.at(-1).seconds}s)`);
    await writeFile(path.join(artifacts,'progress.json'),JSON.stringify(results,null,2));
}
const after=await sourceHashes(),stable=JSON.stringify(before)===JSON.stringify(after);
await writeFile(path.join(artifacts,'results.json'),JSON.stringify({stable,sourceHashes:after,results,limitations:['Disposable SQL and simulated Drive, not hosted Edge/private-account certification.','Native PostgreSQL covers independent-backend request/row/period/upload-lease waits and revocation, not hosted infrastructure or arbitrary crash recovery.','Protected service-only endpoint Deno check is separate.','No production migration, activation, deployment, business-data operation or 4KISTest adaptation.']},null,2));
console.log(JSON.stringify({artifacts,stable,passed:results.filter(result=>result.exitCode===0).length,failed:results.filter(result=>result.exitCode!==0).length}));
if(!stable||results.some(result=>result.exitCode!==0))process.exitCode=1;
