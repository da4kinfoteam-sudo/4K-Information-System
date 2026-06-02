import { errorResponse, handleOptions, jsonResponse, requireActivityEditor, uploadActivityFile } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const form = await request.formData();
    const user = await requireActivityEditor(form.get("user_id"));
    const activityId = Number(form.get("activity_id"));
    const file = form.get("file");

    if (!Number.isFinite(activityId)) throw new Error("A valid activity is required.");
    if (!(file instanceof File)) throw new Error("A file is required.");

    return jsonResponse({
      file: await uploadActivityFile(activityId, file, user)
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to upload Activity file.", 400);
  }
});
