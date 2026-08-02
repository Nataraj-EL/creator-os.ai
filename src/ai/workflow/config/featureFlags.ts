export interface WorkflowFeatureFlags {
  WORKFLOW_RUNTIME: boolean;
  WORKFLOW_PARALLEL: boolean;
  WORKFLOW_PERSISTENCE: boolean;
}

export const featureFlags: WorkflowFeatureFlags = {
  WORKFLOW_RUNTIME: false,
  WORKFLOW_PARALLEL: false,
  WORKFLOW_PERSISTENCE: false,
};
