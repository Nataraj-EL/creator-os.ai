export type JobState = 
  | 'QUEUED' 
  | 'RESERVED' 
  | 'RUNNING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'RETRYING' 
  | 'CANCELLED' 
  | 'DEAD_LETTER';

export interface JobMetadata {
  traceId?: string;
  workflowId?: string;
  agentId?: string;
  creatorId?: string;
  priority: number; // Higher number dequeues first
  tags?: string[];
  attempts: number;
  tenantId?: string;
  workspaceId?: string;
}

export type RetryStrategy = 'fixed' | 'linear' | 'exponential';

export interface ExecutionPolicy {
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  retryStrategy?: RetryStrategy;
}

export interface Job {
  id: string;
  type: 'AGENT' | 'WORKFLOW' | 'TOOL' | 'EVALUATION';
  payload: any;
  status: JobState;
  metadata: JobMetadata;
  policy: ExecutionPolicy;
  createdAt: string;
  updatedAt: string;
  workerId?: string;
}

export interface JobResult {
  jobId: string;
  status: JobState;
  output?: any;
  error?: string;
  durationMs: number;
}

export interface WorkerInfo {
  id: string;
  status: 'ACTIVE' | 'IDLE' | 'STOPPED';
  currentJobs: string[];
  lastHeartbeat: string;
}

export interface QueueMetrics {
  queueDepth: number;
  activeJobs: number;
  completed: number;
  failed: number;
  retries: number;
}

export interface QueueAdapter {
  enqueue(job: Job): Promise<void>;
  dequeue(workerId: string): Promise<Job | null>;
  reserve(jobId: string, workerId: string): Promise<void>;
  release(jobId: string): Promise<void>;
  acknowledge(jobId: string, result: JobResult): Promise<void>;
  retry(jobId: string, error: string, backoffMs: number): Promise<void>;
  cancel(jobId: string): Promise<void>;
  deadLetter(jobId: string, error: string): Promise<void>;
  heartbeat(jobId: string): Promise<void>;
  getJob(jobId: string): Promise<Job | null>;
  getMetrics(): Promise<QueueMetrics>;
}

export type DistributedEventType = 
  | 'JOB_QUEUED' 
  | 'JOB_STARTED' 
  | 'JOB_COMPLETED' 
  | 'JOB_FAILED' 
  | 'JOB_RETRIED' 
  | 'WORKER_STARTED' 
  | 'WORKER_STOPPED' 
  | 'HEARTBEAT_RECEIVED';

export interface DistributedEvent {
  type: DistributedEventType;
  timestamp: string;
  jobId?: string;
  workerId?: string;
  details?: Record<string, any>;
}

export type DistributedListener = (event: DistributedEvent) => void;
