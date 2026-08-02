export interface StreamFeatureFlags {
  STREAM_RUNTIME: boolean;
  STREAM_UI: boolean;
  STREAM_HEARTBEAT: boolean;
}

export const featureFlags: StreamFeatureFlags = {
  STREAM_RUNTIME: false,
  STREAM_UI: false,
  STREAM_HEARTBEAT: false,
};
