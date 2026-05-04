export const healthQueryKeys = {
  all: ["health"] as const,
  status: () => [...healthQueryKeys.all, "status"] as const,
};
