import { adminClient, connectedDrive } from '../_shared/googleDrive.ts';
import { createResourcesHandler } from '../_shared/resourcesHttp.ts';
import { createResourcesStorage } from '../_shared/resourcesDrive.ts';
import { createAwardsGateway } from '../_shared/awardsGateway.ts';

const rpc = async (name: string,args: Record<string,unknown>) => {
  const {data,error} = await adminClient().rpc(name,args);
  if (error) throw error;
  return data;
};
const origins=(Deno.env.get('RESOURCE_ALLOWED_ORIGINS') || Deno.env.get('APP_BASE_URL') || Deno.env.get('SITE_URL') || '').split(',').map(value=>value.trim()).filter(Boolean).map(value=>{
  const url=new URL(value);
  if(url.protocol!=='https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('Resources requires HTTPS origins or an explicit local development origin.');
  return url.origin;
});
// Identity is verified by the narrow Resources credential/session bridge, not the anon API key.
Deno.serve(createResourcesHandler({rpc,origins,storage:createResourcesStorage({rpc,connect:connectedDrive}),awards:createAwardsGateway({rpc})}));
