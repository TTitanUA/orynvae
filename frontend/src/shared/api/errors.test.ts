import { describe, expect, it } from "vitest";

import { ApiError, apiErrorFromResponse, fieldErrorsFromDetail, fieldErrorsFromMessage } from "./errors";

describe("shared API errors", () => {
  it("maps validation detail locations to field errors", () => {
    expect(
      fieldErrorsFromDetail([
        { loc: ["body", "provider_id"], msg: "Provider is required" },
        { loc: ["body", "settings", "model_id"], msg: "Model is required" },
      ]),
    ).toEqual({
      provider_id: "Provider is required",
      model_id: "Model is required",
    });
  });

  it("maps provider selection messages to form fields", () => {
    expect(fieldErrorsFromMessage("Provider and model must be selected together")).toEqual({
      provider_id: "Provider and model must be selected together",
      model_id: "Provider and model must be selected together",
    });
  });

  it("builds ApiError instances from JSON response details", async () => {
    const response = new Response(JSON.stringify({ detail: "Provider not found" }), {
      status: 404,
      statusText: "Not Found",
    });

    const error = await apiErrorFromResponse(response);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe("Provider not found");
    expect(error.status).toBe(404);
    expect(error.fieldErrors).toEqual({ provider_id: "Provider not found" });
  });

  it("uses object detail messages from backend error envelopes", async () => {
    const response = new Response(
      JSON.stringify({
        detail: {
          code: "READ_ONLY_WITHOUT_AI",
          message: "AI provider is not configured",
        },
      }),
      { status: 409, statusText: "Conflict" },
    );

    const error = await apiErrorFromResponse(response);

    expect(error.message).toBe("AI provider is not configured");
    expect(error.status).toBe(409);
  });
});
