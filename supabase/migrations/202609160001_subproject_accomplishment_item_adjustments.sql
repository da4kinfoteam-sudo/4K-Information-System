-- Additive support for physical accomplishment item replacements.
-- Existing subproject detail JSON and production rows are left unchanged.
alter table public.subprojects
    add column if not exists "accomplishmentRemarks" text;

alter table public.budget_item_adjustment_history
    drop constraint if exists budget_item_adjustment_history_action_check;

alter table public.budget_item_adjustment_history
    add constraint budget_item_adjustment_history_action_check
    check (action in (
        'cancel',
        'restore',
        'tag_realignment',
        'tag_savings',
        'clear_tag',
        'create_adjustment_item',
        'edit_adjustment_item',
        'delete_adjustment_item',
        'replace_item',
        'deactivate_adjustment_item',
        'funding_source_changed',
        'update_accomplishment_remarks'
    ));

create index if not exists idx_budget_item_adjustment_history_source_item
    on public.budget_item_adjustment_history (source_type, parent_id, source_item_id, created_at desc);
