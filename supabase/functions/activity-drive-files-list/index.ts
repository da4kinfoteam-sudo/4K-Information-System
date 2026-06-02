import { errorResponse, handleOptions, jsonResponse, listActivityFiles, requireUser } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json();
    await requireUser(body.user_id);
    const activityId = Number(body.activity_id);
    if (!Number.isFinite(activityId)) throw new Error("A valid activity is required.");

    return jsonResponse({
      files: await listActivityFiles(activityId)
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to list Activity files.", 400);
  }
});
