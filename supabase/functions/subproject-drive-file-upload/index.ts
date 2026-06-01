import { errorResponse, handleOptions, jsonResponse, requireSubprojectEditor, uploadSubprojectFile } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const form = await request.formData();
    const user = await requireSubprojectEditor(form.get("user_id"));
    const subprojectId = Number(form.get("subproject_id"));
    const file = form.get("file");

    if (!Number.isFinite(subprojectId)) throw new Error("A valid subproject is required.");
    if (!(file instanceof File)) throw new Error("A file is required.");

    return jsonResponse({
      file: await uploadSubprojectFile(subprojectId, file, user)
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to upload Subproject file.", 400);
  }
});
