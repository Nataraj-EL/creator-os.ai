export interface ExtractionFeatureFlags {
  MEMORY_EXTRACTION: boolean;
  MEMORY_POLICIES: boolean;
}

export const extractionFeatureFlags: ExtractionFeatureFlags = {
  MEMORY_EXTRACTION: false, // Disabled by default for Sprint 10
  MEMORY_POLICIES: false
};
