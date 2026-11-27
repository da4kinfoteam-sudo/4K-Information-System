# Edit Table Controls

Add configurable columns only when explicitly requested. Do not add Edit Table automatically to new tables. When requested, use `components/ui/EditTableControl.tsx`; IPO and GAD are the reference consumers. Reuse the component and its `styles/main.css` rules rather than copying a page-specific chooser or introducing another visual variant. Resources tables default to fixed declared columns; the existing approved ticket list explicitly opts in with `allowColumnEditing`. Awards keeps fixed columns and display-only header filters/sorting. Repository tables ignore obsolete visibility preferences without deleting unrelated storage.

## Contract

- `columns` supplies stable keys, readable labels, groups and optional `locked` flags. Locked columns stay checked and cannot be removed.
- `selected` contains optional column keys. The owning page validates and persists its configuration; the chooser has no database or storage responsibilities.
- `label` gives the dialog a page-specific accessible name, such as Edit IPO Table or Edit GAD Table.
- `onApply` receives the selected optional keys only. Apply is the sole commit action.
- Opening copies the current selections into a draft and focuses Search columns. Searching matches labels/groups without changing selections.
- Reset Columns clears draft optional columns only. Cancel, Escape and outside dismissal discard the draft. The next opening reads current committed selections again.
- Removing a column must clear incompatible sorting/filtering in the owning page. Preserve unrelated state and scope; never widen data access to populate a chooser.

## Visual And Accessibility Standard

- Trigger: existing secondary button, Lucide Columns3 icon and visible Edit Table label.
- `.edit-table-menu`: existing IPO dimensions/tokens, 12px padding, 6px radius, thin border, compact type, 8px gaps and 8px viewport collision padding.
- Search uses a single 2px inset focus outline (`outline-offset: -2px`), matching border and no outer shadow. Do not combine a shared glow with another outward outline.
- `.edit-table-menu__options`: grouped checkboxes, internally scrolling with no forced empty height. Keep full labels available through native tooltips.
- `.table-control-menu-footer`: separated footer with Reset Columns on the left and Cancel/Apply on the right. Footer stays reachable while options scroll.
- Menus are bounded by available viewport height. Mobile checkbox rows/footer buttons keep 44px targets. Radix handles focus containment, dismissal and return to the trigger.
- Do not make compact table headers taller to accommodate editing controls. GAD/IPO headers currently match at 30.890625px under the tested 16px root; compare rendered reference components rather than hard-coding a height assertion for every environment.

## Verification

When changing the shared control, run both `npm run test:ipo-list-columns-ui` and `npm run test:gad-pimme-list-ui`, plus lint/build. Check Apply/Cancel/Reset/dismissal, pinned columns, search focus, account-safe preference handling, short-screen scrolling and desktop/tablet/mobile bounds. Tests must exercise real consumers and verify no extra reads or business writes from column changes.
