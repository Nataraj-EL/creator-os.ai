export interface ApiFeatureFlags {
  API_RUNTIME: boolean;
  API_STREAMING: boolean;
  API_OPENAPI: boolean;
}

export const featureFlags: ApiFeatureFlags = {
  API_RUNTIME: false,
  API_STREAMING: false,
  API_OPENAPI: false,
};
