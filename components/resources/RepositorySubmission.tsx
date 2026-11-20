import React,{useState} from 'react';
import {Send} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {resourceAccess,resourceDate,type RepositoryEntry,type RepositoryAssignment,type ResourcePage,type ResourcesClient,type SubmissionReceipt} from '../../lib/resources';
import {ResourceErrorState,ResourceModal,ResourceTable,ResourceText,useResourceAction,useResourceQuery} from './ResourceControls';
import RepositoryFiles from './RepositoryFiles';

export function RepositorySubmission({client,entry,assignment,onClose,onChanged,onNavigate}:{client:ResourcesClient;entry:RepositoryEntry;assignment:RepositoryAssignment;onClose:()=>void;onChanged:()=>void;onNavigate:(path:string)=>void}){
    const {currentUser,rolesConfigs}=useAuth();
    const [reason,setReason]=useState(''),[signed,setSigned]=useState(false),[selected,setSelected]=useState<string[]>(assignment.receipt_file_ids||[]),[historyOpen,setHistoryOpen]=useState(false),[version,setVersion]=useState(assignment.version);
    const [receipt,setReceipt]=useState<SubmissionReceipt|null>(null),[historyPage,setHistoryPage]=useState(1),[historySize,setHistorySize]=useState(10);
    const history=useResourceQuery<ResourcePage<SubmissionReceipt>>(client,'versions',{id:entry.id,assignment_id:assignment.id,page:historyPage,page_size:historySize},historyOpen);
    const action=useResourceAction(client),onBehalf=assignment.operating_unit!==currentUser?.operatingUnit;
    const editable=resourceAccess(currentUser,rolesConfigs,'Documentary Repository','edit')&&(entry.can_manage||!onBehalf)&&!assignment.waived;
    const accepting=editable&&entry.state==='Published';
    const refresh=()=>{if(historyOpen)history.refresh();onChanged();};
    const submit=async()=>{
        const result=await action.run<SubmissionReceipt>('submission_submit',{entry_id:entry.id,assignment_id:assignment.id,file_ids:selected,signed_declared:signed,reason:onBehalf?reason.trim():null},version);
        if(result){setVersion(result.version);setSelected(result.file_ids);setSigned(false);setHistoryOpen(true);refresh();}
    };
    return <ResourceModal title={`${assignment.operating_unit} Submission`} onClose={onClose} busy={action.saving} wide>
        <div className="modal-card__body resources-form">
            {accepting&&onBehalf&&<label>On-Behalf Reason<textarea className="form-control" value={reason} maxLength={2000} rows={2} required onChange={event=>setReason(event.target.value)}/></label>}
            <RepositoryFiles client={client} entry={entry} assignmentId={assignment.id} reason={onBehalf?reason.trim()||undefined:''} allowUpload={!!accepting} onNavigate={onNavigate} onChanged={refresh} selected={selected} onSelect={accepting&&!action.saving?setSelected:undefined}/>
            {accepting&&entry.requires_signed&&<label className="repository-check repository-check--attestation"><input type="checkbox" className="form-checkbox" checked={signed} disabled={action.saving} onChange={event=>setSigned(event.target.checked)}/>The required signed documents are included.</label>}
            <ResourceErrorState error={action.error}/>
            <details open={historyOpen} onToggle={event=>setHistoryOpen(event.currentTarget.open)}><summary>Submission History</summary><ResourceErrorState error={history.error} retry={history.refresh}/>{historyOpen&&<ResourceTable<SubmissionReceipt> columns={[
                {key:'version',label:'Version',locked:true,width:90,render:row=><ResourceText value={row.version}/>},
                {key:'date',label:'Submitted At',locked:true,width:220,render:row=><ResourceText value={resourceDate(row.submitted_at)}/>},
                {key:'by',label:'Submitted By',default:true,width:200,render:row=><ResourceText value={row.submitted_by_name}/>},
                {key:'state',label:'Status',locked:true,width:170,render:row=><ResourceText value={row.invalidated_at?'Returned For Correction':row.withdrawn_at?'Withdrawn':'Submitted'}/>},
                {key:'reason',label:'Reason',default:true,width:260,render:row=><ResourceText value={row.invalidation_reason}/>},
                {key:'files',label:'Files',locked:true,width:100,render:row=><button type="button" className="resources-text-button" onClick={()=>setReceipt(row)}>View Files</button>},
                {key:'actions',label:'Actions',default:true,width:220,render:row=><ReceiptActions client={client} entry={entry} receipt={row} canWithdraw={!!editable} expectedVersion={version} onChanged={()=>{setVersion(previous=>previous+1);refresh();}}/>},
            ]} rows={history.data?.rows||[]} total={history.data?.total||0} page={historyPage} pageSize={historySize} onPage={setHistoryPage} onPageSize={size=>{setHistorySize(size);setHistoryPage(1);}} loading={history.loading} preferences={`repository-submission-history:${currentUser?.id}`}/>}</details>
        </div><footer className="modal-card__footer repository-submission-footer">{accepting&&<span>{selected.length} Selected</span>}<button type="button" className="btn btn-secondary" onClick={onClose} disabled={action.saving}>Close</button>{accepting&&<button type="button" className="btn btn-primary" disabled={action.saving||!selected.length||selected.length>10||(entry.requires_signed&&!signed)||(onBehalf&&!reason.trim())} onClick={()=>void submit()}><Send aria-hidden="true"/>{action.saving?'Submitting...':'Submit'}</button>}</footer>
        {receipt&&<ResourceModal title={`Submission Version ${receipt.version}`} onClose={()=>setReceipt(null)} wide><div className="modal-card__body resources-form"><RepositoryFiles client={client} entry={entry} assignmentId={assignment.id} fileIds={receipt.file_ids} onNavigate={onNavigate}/></div></ResourceModal>}
    </ResourceModal>;
}

function ReceiptActions({client,entry,receipt,canWithdraw,expectedVersion,onChanged}:{client:ResourcesClient;entry:RepositoryEntry;receipt:SubmissionReceipt;canWithdraw:boolean;expectedVersion:number;onChanged:()=>void}){
    const [kind,setKind]=useState<'submission_return'|'submission_withdraw'|null>(null),[reason,setReason]=useState('');const action=useResourceAction(client);
    if(receipt.invalidated_at||receipt.withdrawn_at)return null;
    return <div className="resources-actions">{entry.can_manage&&<button type="button" className="resources-text-button" onClick={()=>setKind('submission_return')}>Return</button>}{canWithdraw&&<button type="button" className="resources-text-button" onClick={()=>setKind('submission_withdraw')}>Withdraw</button>}{kind&&<ResourceModal title={kind==='submission_return'?'Return For Correction':'Withdraw Submission'} onClose={()=>setKind(null)} busy={action.saving}>
        <form onSubmit={async event=>{event.preventDefault();const result=await action.run(kind,{receipt_id:receipt.id,reason:reason.trim()},expectedVersion);if(result){setKind(null);setReason('');onChanged();}}}><fieldset className="modal-card__body resources-form" disabled={action.saving}><label>Reason<textarea className="form-control" value={reason} maxLength={2000} rows={3} required onChange={event=>setReason(event.target.value)}/></label><ResourceErrorState error={action.error}/></fieldset><footer className="modal-card__footer"><button type="button" className="btn btn-secondary" onClick={()=>setKind(null)} disabled={action.saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={action.saving}>{action.saving?'Saving...':'Confirm'}</button></footer></form>
    </ResourceModal>}</div>;
}
