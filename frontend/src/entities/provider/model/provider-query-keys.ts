export const providerQueryKeys = {
  all: ["providers"] as const,
  lists: () => [...providerQueryKeys.all, "list"] as const,
  list: () => [...providerQueryKeys.lists()] as const,
  defaults: () => [...providerQueryKeys.all, "defaults"] as const,
};
