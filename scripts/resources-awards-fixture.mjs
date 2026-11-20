import {randomUUID} from 'node:crypto';

export async function seedReportorialAwards(db,rpc){
    const token=(await rpc('resource_start_session',{p_identifier:'root',p_password:'fixture-password'})).token;
    let lateReceipt;
    for(const [label,submitted] of [['On-Time Report','2024-09-30T15:59:59.999999Z'],['Late Report','2024-10-01T00:00:00Z'],['Missing Report',null]]){
        const entry=randomUUID(),assignment=randomUUID(),submission=randomUUID(),file=randomUUID(),receipt=randomUUID(),due='2024-09-30T15:59:59.999999Z';
        await db.query(`insert into repository_entries(id,kind,subject,state,required_submission,reporting_year,quarter,include_awards,due_at,created_by_name,published_at) values($1,'Folder',$2,'Published',true,2024,'Q3',true,$3,'Fixture','2024-09-01')`,[entry,label,due]);
        await db.query(`insert into repository_assignments(id,entry_id,operating_unit) values($1,$2,'RPMO 1')`,[assignment,entry]);
        if(!submitted)continue;
        await db.query(`insert into repository_files(id,entry_id,assignment_id,upload_request_id,file_name,mime_type,file_size,storage_state,drive_file_id,sha256,ready_at,uploaded_by,uploaded_by_name) values($1,$2,$3,$4,'signed.pdf','application/pdf',12,'Ready',$5,$6,'2024-09-01',2,'Fixture')`,[file,entry,assignment,randomUUID(),'fixture-'+file,'c'.repeat(64)]);
        await db.query(`insert into repository_submissions(id,assignment_id,version) values($1,$2,1)`,[submission,assignment]);
        await db.query(`insert into repository_submission_versions(id,submission_id,version,submitted_at,submitted_by,submitted_by_name,submitted_for_ou,signed_declared,file_ids,due_at,entry_version) values($1,$2,1,$3,2,'Fixture','RPMO 1',true,$4,$5,1)`,[receipt,submission,submitted,[file],due]);
        if(label==='Late Report')lateReceipt=receipt;
    }
    const mutate=(action,data,version=null)=>rpc('resource_mutate',{p_session:token,p_action:action,p_data:data,p_expected_version:version,p_request_id:randomUUID()});
    const read=(ous=['RPMO 1','RPMO 2'])=>rpc('resource_read',{p_session:token,p_resource:'reportorial',p_args:{reporting_year:2024,ous}});
    return {token,mutate,read,lateReceipt};
}
