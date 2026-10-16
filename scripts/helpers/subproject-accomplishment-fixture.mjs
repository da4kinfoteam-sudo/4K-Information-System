import { readFile } from 'node:fs/promises';
import { createActivityAccomplishmentFixture } from './activity-accomplishment-fixture.mjs';

export async function createSubprojectAccomplishmentFixture({ install = true } = {}) {
    const db = await createActivityAccomplishmentFixture();
    try {
        await db.exec(`alter table subprojects add column "actualCompletionDate" date,
          add column "estimatedCompletionDate" date, add column "catchUpPlanRemarks" text,
          add column "accomplishmentRemarks" text, add column "subprojectCommodities" jsonb default '[]',
          add column physical_accomplishment_submitted_at timestamptz;
          alter table subproject_accomplishments add column delivery_date date, add column remarks text,
          add column created_by text, add column created_at timestamptz default now();
          alter table budget_item_adjustment_history add column amount_delta numeric default 0;
          alter table financial_disbursements add column created_at timestamptz default now();
          alter table financial_obligations add column created_at timestamptz default now();
          insert into roles_config(role,module,can_view,can_edit,visibility_scope) values
          ('User','Subprojects',true,true,'Own OU');`);
        if (install) await db.exec(await readFile('supabase/migrations/202610160001_subproject_accomplishment_persistence.sql', 'utf8'));
        return db;
    } catch (error) { await db.close(); throw error; }
}

export async function runSubprojectAccomplishmentRpc(db, name, args) {
    const fields = name === 'read_subproject_accomplishments'
        ? ['p_actor_id', 'p_actor_password', 'p_subproject_ids', 'p_surface']
        : name === 'save_subproject_accomplishment'
            ? ['p_actor_id', 'p_actor_password', 'p_subproject_id', 'p_surface', 'p_base', 'p_edits', 'p_physical', 'p_reason', 'p_request_key', 'p_targets'] : null;
    if (!fields) throw new Error('Only isolated Subproject accomplishment RPCs are available');
    const values = fields.map(field => ['p_base', 'p_edits', 'p_physical', 'p_targets'].includes(field) ? JSON.stringify(args[field] ?? (field === 'p_targets' ? [] : {})) : args[field]);
    return (await db.query(`select ${name}(${fields.map((_, i) => `$${i + 1}`).join(',')}) as data`, values)).rows[0].data;
}
