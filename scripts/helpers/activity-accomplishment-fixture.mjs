import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';

export async function createActivityAccomplishmentFixture() {
    const require = createRequire(path.join(process.env.PGLITE_RUNTIME || path.join(tmpdir(), '4kis-supplement-sql-runtime'), 'package.json'));
    const { PGlite } = require('@electric-sql/pglite');
    const db = new PGlite();
    try {
        const fixture = await readFile('scripts/run-activity-supplement-sql-check.mjs', 'utf8');
        const start = fixture.indexOf('await db.exec(`') + 'await db.exec(`'.length;
        const end = fixture.indexOf('`);', start);
        if (start < 15 || end < start) throw new Error('Isolated base schema is unavailable');
        await db.exec(fixture.slice(start, end));
        await db.exec(`create role service_role;
          alter table activities add column physical_accomplishment_submitted_at timestamptz,
          add column description text, add column location text, add column component text,
          add column "participatingIpos" jsonb default '[]', add column participating_ipo_ids jsonb default '[]',
          add column "participantsMale" integer default 0, add column "participantsFemale" integer default 0;
          insert into roles_config(role,module,can_view,can_edit,visibility_scope) values
          ('User','Accomplishment - Financial',true,true,'Own OU'),('User','Accomplishment - Physical',true,true,'Own OU');`);
        for (const file of ['202610090001_activity_subproject_budget_item_transfers.sql', '202610120001_activity_transfer_status_allowlist.sql', '202610140001_activity_supplemental_budgets.sql', '202610150002_activity_accomplishment_persistence.sql']) {
            await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
        }
        return db;
    } catch (error) { await db.close(); throw error; }
}

export async function runActivityAccomplishmentRpc(db, name, args) {
    const fields = name === 'read_activity_accomplishments'
        ? ['p_actor_id', 'p_actor_password', 'p_activity_ids', 'p_surface']
        : name === 'save_activity_accomplishment'
            ? ['p_actor_id', 'p_actor_password', 'p_activity_id', 'p_surface', 'p_base', 'p_edits', 'p_physical', 'p_reason', 'p_request_key', 'p_targets'] : null;
    if (!fields) throw new Error('Only isolated accomplishment RPCs are available');
    const values = fields.map(field => ['p_base', 'p_edits', 'p_physical', 'p_targets'].includes(field) ? JSON.stringify(args[field] ?? (field === 'p_targets' ? [] : null)) : args[field]);
    return (await db.query(`select ${name}(${fields.map((_, index) => `$${index + 1}`).join(',')}) as data`, values)).rows[0].data;
}
