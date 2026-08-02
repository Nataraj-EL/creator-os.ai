export interface ExtractionFeatureFlags {
  MEMORY_EXTRACTION: boolean;
  MEMORY_POLICIES: boolean;
  AUTO_MEMORY_LEARNING: boolean;
  AUTO_MEMORY_UPDATE: boolean;
}

export const extractionFeatureFlags: ExtractionFeatureFlags = {
  MEMORY_EXTRACTION: false, // Disabled by default for Sprint 10
  MEMORY_POLICIES: false,
  AUTO_MEMORY_LEARNING: false,
  AUTO_MEMORY_UPDATE: false
};
