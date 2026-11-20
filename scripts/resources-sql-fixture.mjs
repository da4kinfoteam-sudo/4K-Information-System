import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(path.join(process.env.PGLITE_RUNTIME||path.join(tmpdir(),'4kis-supplement-sql-runtime'),'package.json'));
const {PGlite}=require('@electric-sql/pglite');
export async function createResourcesFixture({database}={}){
    const db=database||new PGlite();
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table users(id bigint primary key,username text,email text,password text,role text,"fullName" text,"operatingUnit" text,permissions_override jsonb);
      create table roles_config(id bigint generated always as identity primary key,role text,module text,can_view boolean,can_edit boolean,can_delete boolean,can_manage boolean,visibility_scope text,unique(role,module));
      insert into users values(1,'root','root@example.test','fixture-password','Super Admin','System Administrator','NPMO',null),
        (2,'region1','r1@example.test','fixture-password','User','Region One','RPMO 1',null),
        (3,'region2','r2@example.test','fixture-password','User','Region Two','RPMO 2',null);`);
    for(const name of ['202611200001_resources_foundation.sql','202611200002_resources_workflows.sql','202611200003_resources_reads.sql','202611200004_resources_storage.sql'])await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
    const rpc=async(name,args)=>{
        // Only the fixed handler-selected entry point names reach this disposable adapter.
        const names=Object.keys(args),query=`select ${name}(${names.map((key,i)=>`${key}=>$${i+1}`).join(',')}) value`;
        return (await db.query(query,Object.values(args))).rows[0].value;
    };
    return {db,rpc};
}
