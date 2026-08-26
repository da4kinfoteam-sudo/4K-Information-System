import {
  adminClient,
  errorResponse,
  handleOptions,
  jsonResponse,
  requireUser
} from "../_shared/googleDrive.ts";

type EntityRow = {
  id: number;
  name: string;
  uid?: string | null;
  operatingUnit?: string | null;
  activityDate?: string | null;
  workflow_status?: string | null;
};

type DriveRow = {
  id: number;
  file_id: string;
  file_name: string;
  display_name?: string | null;
  caption?: string | null;
  upload_section?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  web_view_link?: string | null;
  web_content_link?: string | null;
  preview_url?: string | null;
  preview_supported?: boolean | null;
  uploaded_by?: number | null;
  uploaded_by_name?: string | null;
  uploaded_at: string;
  activity_id?: number | null;
  subproject_id?: number | null;
};

const IMAGE_EXTENSIONS = /\.(gif|jpe?g|png|webp)$/i;
const DRIVE_FILE_FIELDS = "id,file_id,file_name,display_name,caption,upload_section,mime_type,file_size,web_view_link,web_content_link,preview_url,preview_supported,uploaded_by,uploaded_by_name,uploaded_at";
const MAX_ENTITY_IDS = 5000;

const normalizeIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map(item => Number(item))
    .filter(item => Number.isInteger(item) && item > 0))]
    .slice(0, MAX_ENTITY_IDS);
};

const chunks = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

const isApproved = (row: { workflow_status?: string | null }) => !row.workflow_status || row.workflow_status === "APPROVED";

const isImageFile = (row: DriveRow) => {
  const mimeType = (row.mime_type || "").toLowerCase();
  return mimeType.startsWith("image/") || IMAGE_EXTENSIONS.test(row.file_name || "");
};

const canSeeAllOus = async (user: { role?: string | null; visibility_scope?: string | null }) => {
  if (user.role === "Super Admin" || user.role === "Administrator" || user.role === "Management") return true;
  if (user.visibility_scope === "All OUs") return true;

  const { data, error } = await adminClient()
    .from("roles_config")
    .select("can_view,visibility_scope")
    .eq("role", user.role)
    .eq("module", "Dashboards")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.can_view === false) throw new Error("You do not have permission to view dashboard data.");
  return data?.visibility_scope === "All OUs";
};

const queryEntities = async (
  table: "activities" | "subprojects",
  ids: number[],
  allOus: boolean,
  operatingUnit: string | null | undefined
) => {
  if (!ids.length) return [] as EntityRow[];
  const select = table === "activities"
    ? "id,name,uid,operatingUnit,date,workflow_status"
    : "id,name,uid,operatingUnit,estimatedCompletionDate,workflow_status";
  const rows: EntityRow[] = [];

  for (const idChunk of chunks(ids, 500)) {
    const { data, error } = await adminClient().from(table).select(select).in("id", idChunk);
    if (error) throw new Error(error.message);
    (data || []).forEach((row: Record<string, unknown>) => {
      if (!isApproved(row) || (!allOus && operatingUnit && row.operatingUnit !== operatingUnit)) return;
      rows.push({
        id: Number(row.id),
        name: String(row.name || "Untitled item"),
        uid: row.uid ? String(row.uid) : null,
        operatingUnit: row.operatingUnit ? String(row.operatingUnit) : null,
        activityDate: table === "activities"
          ? (row.date ? String(row.date) : null)
          : (row.estimatedCompletionDate ? String(row.estimatedCompletionDate) : null),
        workflow_status: row.workflow_status ? String(row.workflow_status) : null
      });
    });
  }

  return rows;
};

const queryFiles = async (table: "activity_drive_files" | "subproject_drive_files", foreignKey: "activity_id" | "subproject_id", ids: number[]) => {
  if (!ids.length) return [] as DriveRow[];
  const rows: DriveRow[] = [];

  for (const idChunk of chunks(ids, 500)) {
    const { data, error } = await adminClient()
      .from(table)
      .select(`${foreignKey},${DRIVE_FILE_FIELDS}`)
      .in(foreignKey, idChunk)
      .is("deleted_at", null)
      .or("upload_section.eq.gallery,upload_section.is.null")
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);

    (data || []).forEach((row: DriveRow) => {
      const uploadSection = row.upload_section;
      if (uploadSection === "gallery" || (!uploadSection && isImageFile(row))) {
        rows.push({ ...row, [foreignKey]: Number(row[foreignKey] || 0) } as DriveRow);
      }
    });
  }

  return rows;
};

const toMediaFile = (row: DriveRow) => ({
  id: Number(row.id),
  file_id: row.file_id,
  file_name: row.file_name,
  display_name: row.display_name ?? null,
  caption: row.caption ?? null,
  upload_section: "gallery" as const,
  mime_type: row.mime_type ?? null,
  file_size: row.file_size ?? null,
  web_view_link: row.web_view_link ?? null,
  web_content_link: row.web_content_link ?? null,
  preview_url: row.preview_url ?? null,
  preview_supported: row.preview_supported ?? null,
  uploaded_by: row.uploaded_by ?? null,
  uploaded_by_name: row.uploaded_by_name ?? null,
  uploaded_at: row.uploaded_at
});

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireUser(body.user_id);
    const activityIds = normalizeIds(body.activity_ids);
    const subprojectIds = normalizeIds(body.subproject_ids);
    const allOus = await canSeeAllOus(user);

    const [activityRows, subprojectRows] = await Promise.all([
      queryEntities("activities", activityIds, allOus, user.operatingUnit),
      queryEntities("subprojects", subprojectIds, allOus, user.operatingUnit)
    ]);
    const [activityFiles, subprojectFiles] = await Promise.all([
      queryFiles("activity_drive_files", "activity_id", activityRows.map(row => row.id)),
      queryFiles("subproject_drive_files", "subproject_id", subprojectRows.map(row => row.id))
    ]);

    const items = [
      ...activityRows.map(row => ({
        entityType: "activity" as const,
        entityId: row.id,
        entityName: row.name,
        entityCode: row.uid ?? null,
        operatingUnit: row.operatingUnit ?? null,
        activityDate: row.activityDate ?? null,
        files: activityFiles.filter(file => file.activity_id === row.id).map(toMediaFile)
      })),
      ...subprojectRows.map(row => ({
        entityType: "subproject" as const,
        entityId: row.id,
        entityName: row.name,
        entityCode: row.uid ?? null,
        operatingUnit: row.operatingUnit ?? null,
        activityDate: row.activityDate ?? null,
        files: subprojectFiles.filter(file => file.subproject_id === row.id).map(toMediaFile)
      }))
    ]
      .filter(item => item.files.length > 0)
      .sort((left, right) => {
        const leftTime = left.files[0]?.uploaded_at ? new Date(left.files[0].uploaded_at).getTime() : 0;
        const rightTime = right.files[0]?.uploaded_at ? new Date(right.files[0].uploaded_at).getTime() : 0;
        return rightTime - leftTime;
      });

    return jsonResponse({ items });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to load Homepage gallery feed.", 400);
  }
});
