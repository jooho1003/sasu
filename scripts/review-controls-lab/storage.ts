// No live credentials/services. These paths must not be used by original playback.
export const createBrowserSupabaseClient = () => ({ storage: { from: () => ({
  upload: async () => ({ error: { statusCode: "409" } }),
  download: () => { throw new Error("direct_storage_download_forbidden"); },
  list: () => { throw new Error("direct_storage_list_forbidden"); },
}) } });
