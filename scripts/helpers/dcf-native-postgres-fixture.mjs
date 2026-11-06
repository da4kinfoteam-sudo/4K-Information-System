import assert from 'node:assert/strict';
import { access, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execute=promisify(execFile);
const runtime=path.join(tmpdir(),'4kis-revision-postgres-runtime');
const bin=path.join(runtime,'node_modules/@embedded-postgres/windows-x64/native/bin');

// Isolated test server only: generated TEMP cluster, random loopback port,
// explicit fixture credentials and mandatory teardown. Never reads DB env URLs.
export async function createNativePostgresFixture() {
    assert.equal(process.platform,'win32','Install the matching native fixture runtime before using another platform');
    const require=createRequire(path.join(runtime,'package.json'));
    const { Client,types }=require('pg');
    types.setTypeParser(20,value=>Number(value));
    types.setTypeParser(1700,value=>Number(value));
    for(const oid of [1082,1114,1184])types.setTypeParser(oid,value=>value);
    const initdb=path.join(bin,'initdb.exe'),pgctl=path.join(bin,'pg_ctl.exe');
    await access(initdb);await access(pgctl);
    const artifacts=await mkdtemp(path.join(tmpdir(),'4kis-dcf-native-'));
    const data=path.join(artifacts,'data'),log=path.join(artifacts,'postgres.log');
    const probe=createServer();
    await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
    const port=probe.address().port;
    await new Promise((resolve,reject)=>probe.close(error=>error?reject(error):resolve()));
    const run=(file,args)=>execute(file,args,{windowsHide:true,timeout:60000,maxBuffer:2*1024*1024});
    const sessions=new Set();let started=false;
    const connect=async()=>{
        const client=new Client({host:'127.0.0.1',port,user:'fixture_admin',password:'',database:'postgres',ssl:false,
            application_name:'4kis-disposable-revision-check',connectionTimeoutMillis:10000});
        await client.connect();
        await client.query(`set statement_timeout='20s';set lock_timeout='10s';set time zone 'UTC';`);
        const session={query:(...args)=>client.query(...args),exec:sql=>client.query(sql),
            close:async()=>{if(sessions.delete(session))await client.end();}};
        sessions.add(session);
        return session;
    };
    const close=async()=>{
        const failures=[];
        for(const session of sessions)try{await session.close();}catch(error){failures.push(error);}
        if(started){await run(pgctl,['-D',data,'-m','immediate','-w','stop']);started=false;}
        if(failures.length)throw new AggregateError(failures,'Native fixture session cleanup failed');
    };
    try{
        await run(initdb,['-D',data,'--username=fixture_admin','--auth=trust','--encoding=UTF8','--locale=C','--no-sync']);
        await run(pgctl,['-D',data,'-l',log,'-o',`-h 127.0.0.1 -p ${port} -c fsync=off -c max_connections=12`,'-w','start']);
        started=true;
        const primary=await connect();
        const server=(await primary.query(`select version() version,host(inet_server_addr()) address,inet_server_port() port,pg_backend_pid() pid`)).rows[0];
        assert.equal(server.address,'127.0.0.1');assert.equal(server.port,port);
        return {primary,connect,close,server,artifacts};
    }catch(error){
        try{await close();}catch(cleanup){error.message+=`; cleanup: ${cleanup.message}`;}
        throw error;
    }
}
