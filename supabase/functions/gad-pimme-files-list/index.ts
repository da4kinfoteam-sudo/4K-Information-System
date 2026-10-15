import { errorResponse, handleOptions, jsonResponse, listGadPimmeFiles, listGadPimmeAssessmentMovs, requireGadPimmeViewer } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireGadPimmeViewer(body.user_id);
    const files = body.all_questions === true
      ? await listGadPimmeAssessmentMovs(body.operating_unit, body.year, user)
      : await listGadPimmeFiles(body.operating_unit, body.year, body.question_key, user);
    return jsonResponse({ files });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to list GAD PIMME MOVs.", 400);
  }
});
