import { disconnectConnection, errorResponse, handleOptions, jsonResponse, requireSuperAdmin } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json().catch(() => ({}));
    await requireSuperAdmin(body.user_id);
    await disconnectConnection();
    return jsonResponse({ message: "Google Drive storage disconnected." });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to disconnect Google Drive.", 400);
  }
});
