export interface CacheFeatureFlags {
  CACHE_ENABLED: boolean;
  CACHE_DEFAULT_TTL: number;
}

export const featureFlags: CacheFeatureFlags = {
  CACHE_ENABLED: false,
  CACHE_DEFAULT_TTL: 3600
};
