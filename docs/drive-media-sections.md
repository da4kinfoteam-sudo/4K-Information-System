# Gallery and Files Upload Contract

The main build uses one shared media contract for IPO, Subproject, and Activity detail pages. This document is the implementation reference for the later `4kistest` redesign port.

## Stored metadata

Each row in `ipo_drive_files`, `subproject_drive_files`, and `activity_drive_files` contains:

- `upload_section`: `gallery` or `files`.
- `display_name`: optional app-visible image name. The original Google Drive filename remains in `file_name`.
- `caption`: optional app-only image caption.

Gallery membership is based on `upload_section`, not MIME type. Gallery uploads accept supported images only. Files uploads accept the existing PDF and image types, and an image uploaded to Files does not appear in Gallery.

## Google Drive layout

New uploads add a final folder below the existing entity folder:

```text
<existing entity folder>/Gallery
<existing entity folder>/Files
```

Migration `202607230001_drive_media_sections.sql` classifies existing image rows as Gallery and other existing rows as Files. It does not move, delete, rename, or re-upload existing Google Drive objects.

## Shared frontend components

`components/ui/DriveMediaSections.tsx` exports:

- `DriveUploadDropzone`: multi-file picker, drag-and-drop, per-file validation, two-upload concurrency, partial failure handling, and batch results.
- `EntityGallery`: thumbnail/list/carousel views, large preview, app-visible name and caption editing, refresh, and deletion handoff.
- `EntityFilesList`: Files-only upload, bounded scroll list, preview/open controls, refresh, and deletion handoff.
- `getPersistedDriveUploadSection`: compatibility classification while clients and migrations are rolling out.

Entity pages continue to own authorization, Drive connection state, deletion confirmation, and their entity-specific API calls.

## Porting to `4kistest`

Port the storage types and API contract first, then reuse or adapt the shared UI components. Do not return to MIME-derived Gallery membership. Preserve the `display_name ?? file_name` fallback and keep the original Drive filename immutable unless a separate storage-rename feature is explicitly approved.
