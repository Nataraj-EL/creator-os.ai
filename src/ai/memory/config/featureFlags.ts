export interface MemoryFeatureFlags {
  MEMORY_ENABLED: boolean;
  MEMORY_WRITE: boolean;
  MEMORY_READ: boolean;
}

export const memoryFeatureFlags: MemoryFeatureFlags = {
  MEMORY_ENABLED: false, // Disabled by default for Sprint 6
  MEMORY_WRITE: false,
  MEMORY_READ: false
};
