export type ApiFieldErrors = Record<string, string>;

type ApiValidationIssue = {
  loc?: unknown[];
  msg?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: ApiFieldErrors;

  constructor(message: string, status: number, fieldErrors: ApiFieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function fieldNameFromLocation(location: unknown): string | undefined {
  if (!Array.isArray(location)) {
    return undefined;
  }

  const field = [...location]
    .reverse()
    .find((item) => typeof item === "string" && item !== "body");
  return typeof field === "string" ? field : undefined;
}

export function fieldErrorsFromDetail(detail: unknown): ApiFieldErrors {
  if (!Array.isArray(detail)) {
    return {};
  }

  return detail.reduce<ApiFieldErrors>((errors, issue: ApiValidationIssue) => {
    const field = fieldNameFromLocation(issue.loc);
    if (field && typeof issue.msg === "string") {
      errors[field] = issue.msg;
    }
    return errors;
  }, {});
}

export function fieldErrorsFromMessage(message: string): ApiFieldErrors {
  if (message === "Provider and model must be selected together") {
    return {
      provider_id: "Provider and model must be selected together",
      model_id: "Provider and model must be selected together",
    };
  }
  if (message === "Provider not found" || message === "Provider is disabled") {
    return { provider_id: message };
  }
  if (
    message === "Model does not belong to this provider" ||
    message === "Model is not allowed for this provider"
  ) {
    return { model_id: message };
  }
  return {};
}

function messageFromDetail(detail: unknown): string | undefined {
  if (typeof detail === "string") {
    return detail;
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    const message = (detail as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}

export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => undefined);
  const detail =
    body && typeof body === "object" && "detail" in body
      ? (body as { detail?: unknown }).detail
      : undefined;
  const detailMessage = messageFromDetail(detail);
  const message = detailMessage || response.statusText || `Request failed with status ${response.status}`;
  const fieldErrors = {
    ...fieldErrorsFromDetail(detail),
    ...fieldErrorsFromMessage(message),
  };
  return new ApiError(message, response.status, fieldErrors);
}
