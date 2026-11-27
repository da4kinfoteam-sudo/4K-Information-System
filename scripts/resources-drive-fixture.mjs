import assert from 'node:assert/strict';
export function createResourcesDriveFixture(){
    const files=new Map(),sessions=new Map(),calls=[];let next=0,loseFinal=false,shared=false;
    const context={connection:{id:'disposable-drive',google_account_email:'owner@example.test',root_folder_id:'configured-master'},accessToken:'fixture-drive-token'};
    files.set('configured-master',{id:'configured-master',name:'4KIS Master',mimeType:'application/vnd.google-apps.folder',parents:['inaccessible-my-drive']});
    const metadata=item=>{const {bytes,...value}=item;return value;};
    const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
    const fetcher=async(value,init={})=>{
        const url=new URL(value),method=init.method||'GET',headers=new Headers(init.headers);assert.equal(headers.get('authorization'),'Bearer fixture-drive-token');calls.push({url:value,method});
        if(url.pathname.endsWith('/permissions'))return json({permissions:[{type:'user',role:'owner',emailAddress:context.connection.google_account_email},...(shared?[{type:'anyone',role:'reader'}]:[])]});
        if(url.pathname.endsWith('/generateIds'))return json({ids:['original-'+(++next)]});
        if(url.pathname==='/upload/drive/v3/files'&&method==='POST'){
            const item=JSON.parse(init.body),session='https://www.googleapis.com/upload/drive/v3/files?upload_id='+item.id;
            sessions.set(session,{item,total:Number(headers.get('x-upload-content-length')),offset:0,chunks:[]});
            return new Response(null,{status:200,headers:{location:session}});
        }
        if(url.pathname==='/upload/drive/v3/files'&&method==='PUT'){
            const session=sessions.get(value);if(!session)return json({},404);
            const range=headers.get('content-range');
            if(!range.startsWith('bytes */')){
                const match=range.match(/^bytes (\d+)-(\d+)\/(\d+)$/);if(!match||Number(match[1])!==session.offset)return json({},400);
                session.chunks.push(new Uint8Array(init.body));session.offset=Number(match[2])+1;
            }
            if(session.offset===session.total){
                const bytes=new Uint8Array(session.total);let offset=0;for(const chunk of session.chunks){bytes.set(chunk,offset);offset+=chunk.length;}
                const item={...session.item,size:String(session.total),bytes};files.set(item.id,item);
                if(loseFinal){loseFinal=false;throw new TypeError('Synthetic lost final response');}
                return json(metadata(item));
            }
            return new Response(null,{status:308,headers:session.offset?{range:'bytes=0-'+(session.offset-1)}:{}});
        }
        if(url.pathname==='/drive/v3/files'&&method==='GET'){
            const q=url.searchParams.get('q')||'',key=q.match(/value='([^']+)'/)?.[1];return json({files:[...files.values()].filter(item=>item.appProperties?.resourceIdentity===key&&(!q.includes("'root' in parents")||item.parents?.includes('inaccessible-my-drive'))).map(metadata)});
        }
        if(url.pathname==='/drive/v3/files'&&method==='POST'){
            const item={id:'folder-'+(++next),...JSON.parse(init.body)};files.set(item.id,item);return json(item);
        }
        const id=decodeURIComponent(url.pathname.split('/').pop()),item=files.get(id);if(!item)return json({},404);
        if(method==='PATCH'){Object.assign(item,JSON.parse(init.body));return json(metadata(item));}
        if(method==='DELETE'){files.delete(id);return new Response(null,{status:204});}
        if(url.searchParams.get('alt')==='media')return new Response(item.bytes,{headers:{'content-length':String(item.bytes.length)}});
        return json(metadata(item));
    };
    return {context,connect:async()=>context,fetcher,files,calls,loseNextFinalResponse:()=>{loseFinal=true;},setShared:value=>{shared=value;}};
}
