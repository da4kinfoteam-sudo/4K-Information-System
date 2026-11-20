import { ResourceError, resourceJson, resourceSafeError, resourceUuid } from './resourcesProtocol.ts';

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Storage = (action: string, session: string, request: Request, data: Record<string, unknown>) => Promise<Response | unknown>;
type Dependencies = { rpc: Rpc; storage?: Storage; origins: string[] };

const mutations = new Set([
  'entry_save','entry_publish','entry_state','assignment_waive','file_reserve','submission_submit',
  'submission_return','submission_withdraw','ticket_create','ticket_comment','ticket_update','ticket_reopen_request',
  'reportorial_source','reportorial_finalize','reportorial_reopen','session_end'
]);

export function createResourcesHandler({rpc,storage,origins}: Dependencies) {
  return async (request: Request) => {
    const origin = request.headers.get('origin');
    const allowed = !origin || origins.includes(origin);
    const headers: Record<string,string> = {
      'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer','Vary':'Origin',
      ...(allowed && origin ? {'Access-Control-Allow-Origin':origin} : {}),
      'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-resource-session, x-resource-action, x-resource-file, x-resource-offset',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Expose-Headers':'content-disposition, content-type'
    };
    const json = (value: unknown,status=200) => new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}});
    try {
      if (!allowed) throw new ResourceError('This origin is not allowed.',403);
      if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
      if (request.method !== 'POST') throw new ResourceError('Use POST for Resources.',405);
      const chunk = request.headers.get('x-resource-action') === 'upload_chunk';
      const body = chunk ? {} : await resourceJson(request);
      const action = chunk ? 'upload_chunk' : body.action;
      if (action === 'session_start') {
        if (typeof body.identifier !== 'string' || typeof body.password !== 'string') throw new ResourceError('Verify your account to continue.',401);
        const result = await rpc('resource_start_session',{p_identifier:body.identifier,p_password:body.password}) as {error?:string};
        return result.error ? json({error:result.error,code:'SESSION_REQUIRED'},401) : json(result);
      }
      const session = request.headers.get('x-resource-session') || '';
      if (!/^[a-f0-9]{64}$/.test(session)) throw new ResourceError('Verify your account to continue.',401,'SESSION_REQUIRED');
      if (action === 'read') {
        if (typeof body.resource !== 'string') throw new ResourceError('Choose a resource.');
        return json(await rpc('resource_read',{p_session:session,p_resource:body.resource,p_args:body.args || {}}));
      }
      if (action === 'mutate') {
        if (typeof body.mutation !== 'string' || !mutations.has(body.mutation)) throw new ResourceError('Unsupported Resources action.');
        const data = body.data;
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ResourceError('Provide the record changes.');
        if (body.version != null && (!Number.isInteger(body.version) || Number(body.version) < 0)) throw new ResourceError('Invalid record version.');
        return json(await rpc('resource_mutate',{p_session:session,p_action:body.mutation,p_data:data,p_request_id:resourceUuid(body.request_id),p_expected_version:body.version ?? null}));
      }
      if (typeof action === 'string' && ['upload_begin','upload_chunk','upload_status','upload_cleanup','file_content'].includes(action) && storage) {
        const result = await storage(action,session,request,body);
        if (result instanceof Response) {
          const merged = new Headers(result.headers); for (const [name,value] of Object.entries(headers)) merged.set(name,value);
          return new Response(result.body,{status:result.status,headers:merged});
        }
        return json(result);
      }
      throw new ResourceError('Unsupported Resources action.');
    } catch(error) {
      const safe=resourceSafeError(error);
      return json({error:safe.message,code:safe.code},safe.status);
    }
  };
}
