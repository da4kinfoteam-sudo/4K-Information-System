import { ResourceError, resourceUuid } from './resourcesProtocol.ts';
import { calculateCapturedAwards, awardsCalculatorSourceHash } from './awardsCalculator.generated.mjs';

type Rpc=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
type ObjectValue=Record<string,any>;
const object=(v:unknown):v is ObjectValue=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(args:ObjectValue,allowed:string[])=>{if(Object.keys(args).some(k=>!allowed.includes(k)))throw new ResourceError('Unexpected Awards request fields.');};
const year=(v:unknown)=>{if(!Number.isInteger(v)||Number(v)<1900||Number(v)>9999)throw new ResourceError('Choose a valid Awards Year.');return Number(v);};
const version=(v:unknown)=>{if(!Number.isSafeInteger(v)||Number(v)<0)throw new ResourceError('Invalid Awards version.');return Number(v);};
const reason=(v:unknown)=>{if(typeof v!=='string'||!v.trim()||v.length>4000)throw new ResourceError('Provide a reason for this Awards change.');return v.trim();};

export function createAwardsGateway({rpc,calculate=calculateCapturedAwards}:{rpc:Rpc;calculate?:(capture:unknown)=>ObjectValue}){
    const calculateSnapshot=(capture:unknown):ObjectValue=>({...calculate(capture),calculatorHash:awardsCalculatorSourceHash});
    return async(operation:string,session:string,requestArgs:unknown)=>{
        if(!object(requestArgs))throw new ResourceError('Provide the Awards request details.');
        const args=requestArgs,scope=()=>{if(!object(args.scope))throw new ResourceError('Choose the comparison scope.');return args.scope;};
        try{
            if(operation==='controller'){
                keys(args,['year','scope']);return await rpc('award_read_controller',{p_session:session,p_year:year(args.year),p_scope:scope()});
            }
            if(operation==='save_controller'){
                keys(args,['year','scope','settings','manual','policy','expectedVersion','requestId','reason']);
                if(!object(args.settings)||!Array.isArray(args.manual))throw new ResourceError('Provide the scoring settings and manual inputs.');
                return await rpc('award_save_controller',{p_session:session,p_year:year(args.year),p_scope:scope(),p_settings:args.settings,p_manual:args.manual,p_policy:args.policy??null,p_expected_version:version(args.expectedVersion),p_request_id:resourceUuid(args.requestId),p_reason:args.reason==null?null:reason(args.reason)});
            }
            if(operation==='history'){
                keys(args,['year','scope','before','limit']);
                if(args.limit!=null&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>50))throw new ResourceError('Invalid Awards history page size.');
                return await rpc('award_history',{p_session:session,p_year:year(args.year),p_scope:scope(),p_before:args.before==null?null:version(args.before),p_limit:args.limit??10});
            }
            if(operation==='result'){
                keys(args,['resultId']);return await rpc('award_read_result',{p_session:session,p_result_id:resourceUuid(args.resultId)});
            }
            if(operation==='preview'){
                keys(args,['year','scope']);const capture=await rpc('award_capture_sources',{p_session:session,p_year:year(args.year),p_scope:scope()}) as ObjectValue;
                return {captureId:capture.id,controllerVersion:capture.controller_version,headVersion:capture.result_head_version,policyId:capture.policy_id,expiresAt:capture.expires_at,calculation:calculateSnapshot(capture)};
            }
            if(operation==='finalize'){
                keys(args,['captureId','requestId','reason','acknowledgeWarnings']);
                const captureId=resourceUuid(args.captureId),requestId=resourceUuid(args.requestId),explanation=reason(args.reason);
                const cached=await rpc('award_finalize_status',{p_session:session,p_capture_id:captureId,p_request_id:requestId,p_reason:explanation});if(cached)return cached;
                const capture=await rpc('award_read_capture',{p_session:session,p_capture_id:captureId}) as ObjectValue;
                if(Date.parse(capture.expires_at)<=Date.now())throw new ResourceError('The Awards preview expired. Review a fresh preview.',409,'AWARDS_CONFLICT');
                const snapshot=calculateSnapshot(capture);
                if(snapshot.policy.mode!=='Cutoff'||!snapshot.canFinalize)throw new ResourceError('Resolve the blocking calculation issues and approve the annual cutoff policy before finalizing.',409,'AWARDS_REVIEW_REQUIRED');
                if(snapshot.reconciliation.issues.some((i:ObjectValue)=>i.severity==='warning')&&args.acknowledgeWarnings!==true)throw new ResourceError('Review and acknowledge the calculation warnings before finalizing.',409,'AWARDS_REVIEW_REQUIRED');
                return await rpc('award_commit_calculated',{p_session:session,p_capture_id:captureId,p_snapshot:snapshot,p_request_id:requestId,p_reason:explanation});
            }
            if(operation==='restore'){
                keys(args,['resultId','expectedVersion','requestId','reason']);
                return await rpc('award_activate_result',{p_session:session,p_result_id:resourceUuid(args.resultId),p_expected_version:version(args.expectedVersion),p_request_id:resourceUuid(args.requestId),p_reason:reason(args.reason)});
            }
            if(operation==='reconcile'){
                keys(args,['selections','requestId','reason']);
                if(!Array.isArray(args.selections)||args.selections.length<1||args.selections.length>20)throw new ResourceError('Choose up to twenty finalized years to reconcile.');
                const selections=args.selections.map((row:unknown)=>{if(!object(row))throw new ResourceError('Invalid reconciliation selection.');keys(row,['resultId','expectedVersion']);return {resultId:resourceUuid(row.resultId),expectedVersion:version(row.expectedVersion)};});
                return await rpc('award_activate_result_batch',{p_session:session,p_selections:selections,p_request_id:resourceUuid(args.requestId),p_reason:reason(args.reason)});
            }
            throw new ResourceError('Unsupported Awards operation.');
        }catch(error){
            if((error as {code?:string})?.code==='AWARDS_NUMERIC_RANGE')throw new ResourceError('Some financial values exceed the calculation range. Review their source records before finalizing.',409,'AWARDS_REVIEW_REQUIRED');
            if((error as {code?:string})?.code==='40001')throw new ResourceError('The Awards source, controller or active version changed. Review a fresh preview before saving.',409,'AWARDS_CONFLICT');
            throw error;
        }
    };
}
