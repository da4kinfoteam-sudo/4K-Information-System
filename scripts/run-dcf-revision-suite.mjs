import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Explicit isolated suite: deliberately excludes the old transfer SQL runner,
// which queries the linked remote schema. No deploy, migration CLI or live saves.
const suites=[
 'dcf-revision-domain','dcf-revision-sql','dcf-revision-safety','dcf-revision-coverage',
 'dcf-revision-workflow','dcf-revision-adjustment','dcf-revision-reference','dcf-revision-preview','dcf-revision-prestate',
 'dcf-revision-storage','dcf-revision-ui','dcf-historical-presentation','dcf-revision-e2e','dcf-revision-concurrency','dcf-revision-batch',
 'dcf-activity-subproject-integration','dcf-program-management','dcf-detail-ui','dcf-import','dcf-archive','dcf-pm-list-ui',
 'activity-accomplishment','activity-accomplishment-sql','activity-accomplishment-ui',
 'activity-budget-schedule','activity-budget-ui','activity-ipo-links','activity-ipo-ui',
 'activity-repeating','activity-repeating-ui','activity-supplement','activity-supplement-sql','activity-supplement-ui','activity-title',
 'activity-funding-origin','activity-funding-origin-sql','activity-funding-origin-ui',
 'subproject-accomplishment','subproject-accomplishment-sql','subproject-accomplishment-ui',
 'subproject-budget-schedule','subproject-budget-ui','subproject-budget-lifecycle',
 'independent-budget-target','independent-budget-target-sql','independent-budget-target-ui','independent-budget-target-excel','independent-budget-target-acf',
 'budget-item-transfer','financial-breakdown-hierarchy','signed-obligation','financial-obligation-sync',
 'report-scope','report-scope-ui','dashboard-scope','dashboard-scope-ui',
];
const artifacts=await mkdtemp(path.join(tmpdir(),'4kis-dcf-final-suite-'));
const previewSuites=new Set(['dcf-historical-presentation','dcf-revision-domain','dcf-revision-ui','dcf-revision-e2e','dcf-program-management','dcf-detail-ui']);
const fundingSuites=new Set(['activity-funding-origin','activity-funding-origin-sql','activity-funding-origin-ui','activity-repeating','activity-repeating-ui',
 'activity-supplement','activity-supplement-sql','activity-supplement-ui','activity-accomplishment','activity-accomplishment-sql','activity-accomplishment-ui',
 'dcf-revision-safety','dcf-activity-subproject-integration','budget-item-transfer','independent-budget-target-excel','report-scope','report-scope-ui','dashboard-scope','dashboard-scope-ui']);
const selectedSuites=process.argv.includes('--preview')?suites.filter(name=>previewSuites.has(name)):process.argv.includes('--funding-origin')?suites.filter(name=>fundingSuites.has(name)):suites;
async function sourceHashes(){
 const listing=spawnSync('git',['ls-files','-co','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true});
 assert.equal(listing.status,0,listing.stderr);
 const files=[...new Set(listing.stdout.split('\0').filter(file=>/\.(?:[cm]?[jt]sx?|sql|css|json)$/.test(file)))].sort();
 return Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
}
const before=await sourceHashes(),results=[];
console.log(`Evidence: ${artifacts}`);
for(const name of selectedSuites){
 const started=Date.now(),result=spawnSync(process.execPath,['--experimental-strip-types',`scripts/run-${name}-check.mjs`],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
 await writeFile(path.join(artifacts,`${name}.log`),`${result.stdout||''}\n${result.stderr||''}`);
 results.push({name,exitCode:result.status,error:result.error?.message,seconds:(Date.now()-started)/1000});
 console.log(`${result.status===0?'PASS':'FAIL'} ${name} (${results.at(-1).seconds}s)`);
 await writeFile(path.join(artifacts,'progress.json'),JSON.stringify(results,null,2));
}
for(const [name,args]of [['lint',['node_modules/typescript/bin/tsc','--noEmit']],['build',['node_modules/vite/bin/vite.js','build']]]){
 const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
 await writeFile(path.join(artifacts,`${name}.log`),`${result.stdout||''}\n${result.stderr||''}`);
 results.push({name,exitCode:result.status,error:result.error?.message});console.log(`${result.status===0?'PASS':'FAIL'} ${name}`);
}
const after=await sourceHashes(),stable=JSON.stringify(before)===JSON.stringify(after);
await writeFile(path.join(artifacts,'results.json'),JSON.stringify({stable,sourceHashes:after,results,limitations:[
 'Disposable/synthetic checks, not production catalog or authenticated live-user certification.',
 'Native PostgreSQL verifies per-parent locking and transfer-pair timing, not global unrelated-parent commit ordering or crash recovery.',
 'No remote SQL, baseline, deployment, promotion or production business-data operations.',
]},null,2));
console.log(JSON.stringify({artifacts,stable,passed:results.filter(r=>r.exitCode===0).length,failed:results.filter(r=>r.exitCode!==0).length}));
if(!stable||results.some(r=>r.exitCode!==0))process.exitCode=1;
