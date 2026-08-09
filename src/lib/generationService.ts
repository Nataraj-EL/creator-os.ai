import { apiClient } from './api-client';
import { AIMiddlewareRunner } from '../ai/middleware/runner';
import { 
  TraceMiddleware, 
  TimingMiddleware, 
  LoggingMiddleware, 
  MemoryLearningMiddleware,
  EvaluationMiddleware,
  EvaluationRuntimeMiddleware
} from '../ai/middleware/builtins';
import { evaluationService } from '../ai/evaluation/services';
import { AIRequest, AIResponse, AIHandler, AIContext } from '../ai/middleware/types';
import { featureFlags } from '../ai/evaluation/config/featureFlags';
import { EvaluationStage, EvaluationStatus } from '../ai/evaluation/types';
import { QualityGateError, EvaluationRuntimeError } from '../ai/evaluation/utils/errors';
import { featureFlags as evalFeatureFlags } from '../ai/evaluation/config/featureFlags';
import { cacheService } from '../ai/cache/services';
import { buildCacheKey } from '../ai/cache/utils/key';
import { MiddlewareAction } from '../ai/middleware/types';
import { experimentService } from '../ai/evaluation/runtime';
import { 
  featureFlags as providerFeatureFlags,
  providerResolver,
  providerRegistry,
  ExponentialBackoffRetryPolicy,
  DefaultTimeoutPolicy,
  ProviderRuntime
} from '../ai/providers';

import { ContextAssemblyRuntime } from '../ai/context/services';
import { MemoryRuntime } from '../ai/memory/services';
import { 
  featureFlags as agentFeatureFlags, 
  AgentPlanner, 
  AgentRuntime,
  AgentServices 
} from '../ai/agent';
import { traceEventBus } from '../ai/observability/services/traceRuntime';
import { memoryProviderRegistry } from '../ai/memory/providers';
import { MemoryRepositoryFactory } from '../ai/memory/storage/repositoryFactory';
import { PromptBuilder, promptFeatureFlags } from '../ai/prompt';
import { RetrievalService } from '../ai/retrieval';

import { StreamRuntime, DefaultStreamAdapter, WordChunkingStrategy } from '../ai/streaming';
import { ToolRegistry, DefaultToolExecutor, DefaultToolValidator, ToolRuntime, ToolResolver } from '../ai/tools';
import { policyRuntime, featureFlags as policyFeatureFlags } from '../ai/policy';
import { MCPClientHub } from '../ai/mcp';
import { WorkflowRegistry, StepExecutorRegistry, WorkflowRuntime, WorkflowPersistenceFactory } from '../ai/workflow';
import { CachingMiddleware } from '../ai/cache/middleware/cachingMiddleware';

// Instantiate and initialize a shared runner instance
export const generationMiddlewareRunner = new AIMiddlewareRunner();

export const streamRuntime = new StreamRuntime(
  providerResolver,
  new DefaultStreamAdapter(),
  new WordChunkingStrategy()
);

export const toolRegistry = new ToolRegistry();
export const toolExecutor = new DefaultToolExecutor();
export const toolValidator = new DefaultToolValidator();
export const toolRuntime = new ToolRuntime(toolRegistry, toolExecutor, toolValidator);
export const toolResolver = new ToolResolver(toolRuntime);

export const mcpClientHub = new MCPClientHub();

export const workflowRegistry = new WorkflowRegistry();
export const stepExecutorRegistry = new StepExecutorRegistry();
export const workflowRuntime = new WorkflowRuntime(
  workflowRegistry,
  WorkflowPersistenceFactory.getStore(),
  stepExecutorRegistry,
  {}
);

// Ensure built-in middlewares are registered exactly once
if (generationMiddlewareRunner.getMiddlewares().length === 0) {
  generationMiddlewareRunner.use(new TraceMiddleware());
  generationMiddlewareRunner.use(new TimingMiddleware());
  generationMiddlewareRunner.use(new LoggingMiddleware());
  generationMiddlewareRunner.use(new MemoryLearningMiddleware());
  generationMiddlewareRunner.use(new EvaluationMiddleware(evaluationService));
  generationMiddlewareRunner.use(new EvaluationRuntimeMiddleware());
  generationMiddlewareRunner.use(new CachingMiddleware());
}

export interface GenerationRequest extends AIRequest {
  workspaceId: string;
  title: string;
  topic: string;
  primaryGoal: string;
}

export interface GenerationResponse extends AIResponse {
  data: any; // Carries raw axios response data from target content API
}

let contextAssemblyRuntimeInstance: ContextAssemblyRuntime | null = null;

function getContextAssemblyRuntime(): ContextAssemblyRuntime {
  if (!contextAssemblyRuntimeInstance) {
    const memoryRepo = MemoryRepositoryFactory.getRepository();
    const memoryRuntime = new MemoryRuntime(memoryProviderRegistry, memoryRepo);
    const retrievalService = new RetrievalService();
    contextAssemblyRuntimeInstance = new ContextAssemblyRuntime(memoryRuntime, undefined, undefined, retrievalService);
  }
  return contextAssemblyRuntimeInstance;
}

export async function runPreProviderGenerationSteps(
  context: AIContext,
  request: GenerationRequest,
  templateOverride?: string
): Promise<{
  finalTopic: string;
  contextResult: any;
  selectedMemoryIds: string[];
  promptVersion: string;
}> {
  let finalTopic = request.topic;
  let selectedMemoryIds: string[] = [];
  let promptVersion = '1.0.0';
  let contextResult: any = null;

  if (promptFeatureFlags.CONTEXT_INJECTION) {
    try {
      const assembler = getContextAssemblyRuntime();
      const promptString = `Topic: ${request.topic} | Title: ${request.title} | Goal: ${request.primaryGoal}`;
      
      contextResult = await assembler.assemble({
        userId: context.creatorId,
        prompt: promptString,
        tokenBudget: 2000,
        metadata: { requestId: context.requestId, traceId: context.traceId }
      });

      selectedMemoryIds = contextResult.blocks.map((b: any) => b.id);

      if (promptFeatureFlags.PROMPT_BUILDER) {
        const systemInstructions = templateOverride || `You are CreatorOS AI content generator. Title: ${request.title}. Primary Goal: ${request.primaryGoal}.`;
        const promptPackage = PromptBuilder.build(request.topic, contextResult, {
          systemInstructions
        });
        
        promptVersion = promptPackage.metadata.promptVersion;

        // Adapt PromptPackage to provider-specific payload
        const formattedBlocksStr = promptPackage.contextBlocks.join('\n\n');
        finalTopic = `${promptPackage.systemInstructions}\n\nUse the following relevant context:\n\n${formattedBlocksStr}\n\nUser Prompt: ${promptPackage.userPrompt}`;
      }
    } catch (err) {
      console.error("[AI-GEN] Context injection failed (fail-open):", err);
    }
  }

  if (policyFeatureFlags.POLICY_RUNTIME && policyFeatureFlags.INPUT_GUARDRAILS) {
    try {
      const report = await policyRuntime.evaluate('PRE_PROVIDER', finalTopic, {
        requestId: context.requestId,
        traceId: context.traceId,
        creatorId: context.creatorId,
        provider: context.metadata.provider || request.provider,
        model: context.metadata.model || request.model,
        metadata: context.metadata
      });
      finalTopic = report.finalContent;
    } catch (err: any) {
      if (err.name === 'PolicyError') {
        throw err;
      }
      console.error("[AI-GEN] Pre-provider policy evaluate failed (fail-open):", err);
    }
  }

  return { finalTopic, contextResult, selectedMemoryIds, promptVersion };
}

export async function runPostProviderGenerationSteps(
  context: AIContext,
  request: GenerationRequest,
  rawContent: string
): Promise<string> {
  let content = rawContent;
  if (policyFeatureFlags.POLICY_RUNTIME && policyFeatureFlags.OUTPUT_GUARDRAILS) {
    try {
      const report = await policyRuntime.evaluate('POST_PROVIDER', rawContent, {
        requestId: context.requestId,
        traceId: context.traceId,
        creatorId: context.creatorId,
        provider: context.metadata.provider || request.provider,
        model: context.metadata.model || request.model,
        metadata: context.metadata
      });
      content = report.finalContent;
    } catch (err: any) {
      if (err.name === 'PolicyError') {
        throw err;
      }
      console.error("[AI-GEN] Post-provider policy evaluate failed (fail-open):", err);
    }
  }
  return content;
}

export class GenerationHandler implements AIHandler<GenerationRequest, GenerationResponse> {
  public async handle(context: AIContext, request: GenerationRequest): Promise<GenerationResponse> {
    if (agentFeatureFlags.AGENT_RUNTIME) {
      try {
        const planner = new AgentPlanner();
        const memoryRepo = MemoryRepositoryFactory.getRepository();
        const memoryRuntime = new MemoryRuntime(memoryProviderRegistry, memoryRepo);
        const retrievalService = new RetrievalService();
        const DefaultMemoryLearningService = require('../ai/memory/extraction/services/learningService').DefaultMemoryLearningService;
        const memoryLearningService = new DefaultMemoryLearningService();

        const services: AgentServices = {
          providerResolver,
          retrievalService,
          toolRuntime,
          streamRuntime,
          evaluationService,
          memoryLearningService
        };

        const agentRuntime = new AgentRuntime(planner, services);

        agentRuntime.addListener((event) => {
          try {
            traceEventBus.publish({
              traceId: context.traceId || '',
              requestId: context.requestId || '',
              component: 'AgentRuntime',
              stage: 'GENERATION',
              status: event.type.endsWith('FAILED') ? 'failed' : 'completed',
              metadata: {
                eventType: event.type,
                stepId: event.stepId,
                actionType: event.actionType,
                ...event.details
              }
            });
          } catch {
            // Fail-open
          }
        });

        const agentRes = await agentRuntime.run({
          requestId: context.requestId || '',
          traceId: context.traceId || '',
          creatorId: context.creatorId || '',
          workspaceId: request.workspaceId,
          sessionId: (context as any).sessionId || 'session-agent',
          prompt: request.topic,
          metadata: { ...context.metadata }
        });

        return {
          content: agentRes.output,
          data: agentRes
        };
      } catch (err: any) {
        console.error("[AI-AGENT] Agent execution failed, falling back to standard generation (fail-open):", err);
      }
    }

    const config: Record<string, any> = {};

    // Propagate requestId, traceId, and Authorization internally
    if (context.requestId || context.traceId || context.metadata?.authorization) {
      config.headers = {
        'X-Request-Id': context.requestId,
        'X-Trace-Id': context.traceId,
        ...(context.metadata?.authorization ? { 'Authorization': context.metadata.authorization } : {})
      };
    }

    let variantId: string | undefined = undefined;
    let templateOverride: string | undefined = undefined;

    if (featureFlags.EXPERIMENTS_ENABLED) {
      try {
        const activeExperiments = experimentService.getAllExperiments();
        if (activeExperiments.length > 0) {
          const exp = activeExperiments[0];
          const assignment = await experimentService.assignVariant(exp.experimentId, context.traceId || '');
          variantId = assignment.variantId;
          const variant = exp.variants.find(v => v.variantId === variantId);
          if (variant) {
            templateOverride = variant.promptTemplate;
          }
        }
      } catch (err) {
        console.error("[AI-GEN] Experiment variant assignment failed (fail-open):", err);
      }
    }

    const preResult = await runPreProviderGenerationSteps(context, request, templateOverride);

    let responseData: any;

    if (providerFeatureFlags.PROVIDERS_ENABLED) {
      const provider = providerResolver.resolve(context.metadata.provider || request.provider);
      const retryPolicy = new ExponentialBackoffRetryPolicy(
        3, 
        100, 
        2, 
        providerFeatureFlags.RETRY_ENABLED
      );
      const timeoutPolicy = new DefaultTimeoutPolicy(5000);
      const runtime = new ProviderRuntime(providerRegistry, retryPolicy, timeoutPolicy);

      const providerRequest = {
        prompt: preResult.finalTopic,
        model: context.metadata.model || request.model,
        signal: (request as any).signal,
        metadata: {
          workspaceId: request.workspaceId,
          title: request.title,
          primaryGoal: request.primaryGoal
        }
      };

      const providerResponse = await runtime.generate(provider, providerRequest);

      // Automatically append provider, model, version, latency, and retryCount to trace metadata
      context.metadata = {
        ...context.metadata,
        selectedMemoryIds: preResult.selectedMemoryIds,
        promptVersion: preResult.promptVersion,
        variantId,
        contextBlocks: preResult.contextResult ? preResult.contextResult.blocks : [],
        provider: provider.name,
        model: providerResponse.model,
        version: '1.0.0',
        latencyMs: providerResponse.latencyMs,
        retryCount: providerResponse.retryCount
      };

      responseData = {
        scriptDraft: providerResponse.content,
        generatedContent: providerResponse.content,
        content: providerResponse.content,
        metadata: providerResponse.metadata
      };
    } else {
      // Propagate ID arrays, prompt version, variantId, and contextBlocks to shared context metadata
      context.metadata = {
        ...context.metadata,
        selectedMemoryIds: preResult.selectedMemoryIds,
        promptVersion: preResult.promptVersion,
        variantId,
        contextBlocks: preResult.contextResult ? preResult.contextResult.blocks : []
      };

      // Outbound API request to backend generation endpoint
      const apiResponse = await apiClient.post(
        `/api/v1/workspaces/${request.workspaceId}/content`, 
        {
          title: request.title,
          topic: preResult.finalTopic, // Transformed payload!
          primaryGoal: request.primaryGoal
        },
        config
      );
      responseData = apiResponse.data;
    }

    // Map content for EvaluationMiddleware ingestion
    let rawContent = responseData?.scriptDraft || 
                       responseData?.generatedContent || 
                       responseData?.content || 
                       JSON.stringify(responseData);

    rawContent = await runPostProviderGenerationSteps(context, request, rawContent);
    if (responseData) {
      if (responseData.scriptDraft !== undefined) responseData.scriptDraft = rawContent;
      if (responseData.generatedContent !== undefined) responseData.generatedContent = rawContent;
      if (responseData.content !== undefined) responseData.content = rawContent;
    }

    return {
      content: rawContent,
      data: responseData
    };
  }
}

export async function generateContent(
  creatorId: string,
  workspaceId: string,
  title: string,
  topic: string,
  primaryGoal: string,
  metadata?: Record<string, any>
): Promise<{ data: any }> {
  const handler = new GenerationHandler();

  const response = await generationMiddlewareRunner.run<GenerationRequest, GenerationResponse>(
    {
      creatorId,
      stage: 'GENERATION',
      pipeline: 'generation',
      metadata: metadata || {}
    },
    {
      provider: 'Backend-API',
      model: 'Backend-LLM',
      prompt: topic,
      workspaceId,
      title,
      topic,
      primaryGoal
    },
    handler
  );

  return { data: response.data };
}

export async function generateContentStream(
  creatorId: string,
  workspaceId: string,
  title: string,
  topic: string,
  primaryGoal: string,
  options: {
    authorization: string;
    traceId: string;
    requestId: string;
    tenantId: string;
    signal?: AbortSignal;
  },
  onEvent: (event: any) => void
): Promise<void> {
  const context: AIContext = {
    creatorId,
    stage: 'GENERATION',
    pipeline: 'generation',
    requestId: options.requestId,
    traceId: options.traceId,
    startTime: Date.now(),
    metadata: {
      tenantId: options.tenantId,
      workspaceId,
      authorization: options.authorization
    }
  };

  const request: GenerationRequest = {
    provider: 'Backend-API',
    model: 'Backend-LLM',
    prompt: topic,
    workspaceId,
    title,
    topic,
    primaryGoal
  };

  // 1. Run cache check (Sprint 44)
  const cachingMiddleware = new CachingMiddleware();
  const cacheHitAction = await cachingMiddleware.before(context, request);
  if (cacheHitAction === MiddlewareAction.STOP && context.metadata.response) {
    const cachedResponse = context.metadata.response;
    onEvent({
      type: 'metadata',
      timestamp: new Date().toISOString(),
      metadata: { state: 'started', cached: true }
    });
    onEvent({
      type: 'token',
      content: cachedResponse.content,
      timestamp: new Date().toISOString()
    });
    onEvent({
      type: 'completion',
      timestamp: new Date().toISOString(),
      metadata: { durationMs: 0, tokenCount: 1, responseData: cachedResponse.data }
    });
    return;
  }

  // 2. Experiments assignment
  let templateOverride: string | undefined = undefined;
  if (featureFlags.EXPERIMENTS_ENABLED) {
    try {
      const activeExperiments = experimentService.getAllExperiments();
      if (activeExperiments.length > 0) {
        const exp = activeExperiments[0];
        const assignment = await experimentService.assignVariant(exp.experimentId, context.traceId || '');
        context.metadata.variantId = assignment.variantId;
        const variant = exp.variants.find(v => v.variantId === assignment.variantId);
        if (variant) {
          templateOverride = variant.promptTemplate;
        }
      }
    } catch (err) {
      console.error("[AI-GEN] Experiment variant assignment failed (fail-open):", err);
    }
  }

  // 3. Context retrieval & PRE_PROVIDER policies
  const preResult = await runPreProviderGenerationSteps(context, request, templateOverride);

  // 4. Create Stream Session
  // 4. Create Stream Session or Direct Backend Fetch
  let session: any = null;
  let accumulatedText = '';
  let responseData: any = null;

  if (!providerFeatureFlags.PROVIDERS_ENABLED && !providerRegistry.listProviders().some(p => p.name.toLowerCase() === 'backend-api')) {
    // Production Mode: Fetch directly from backend and simulate streaming chunks
    onEvent({
      type: 'metadata',
      timestamp: new Date().toISOString(),
      metadata: { state: 'started' }
    });

    const apiResponse = await apiClient.post(
      `/api/v1/workspaces/${workspaceId}/content`,
      {
        title,
        topic: preResult.finalTopic,
        primaryGoal
      },
      {
        headers: {
          ...(options.authorization ? { 'Authorization': options.authorization } : {})
        }
      }
    );
    responseData = apiResponse.data;
    const finalContent = responseData?.scriptDraft || 
                         responseData?.generatedContent || 
                         responseData?.content || 
                         responseData?.script || 
                         '';
    accumulatedText = finalContent;

    // Simulate streaming token chunks to the client
    const chunker = new WordChunkingStrategy();
    const chunks = chunker.chunk(finalContent);
    for (const chunkContent of chunks) {
      if (options.signal?.aborted) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
      onEvent({
        type: 'token',
        content: chunkContent,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    // Local / Test Mode: Use StreamRuntime
    session = streamRuntime.createSession({
      prompt: preResult.finalTopic,
      model: request.model,
      provider: request.provider,
      signal: options.signal
    }, {
      traceId: options.traceId,
      requestId: options.requestId
    });

    // Link abort signal
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        session.cancel();
      });
    }

    // Track event bus started
    traceEventBus.publish({
      traceId: options.traceId,
      requestId: options.requestId,
      stage: 'streaming',
      component: 'StreamRuntime',
      status: 'started',
      metadata: { model: request.model, provider: request.provider }
    });

    session.subscribe({
      onEvent(event: any) {
        if (event.type === 'token') {
          accumulatedText += event.content || '';
          // Emit chunk to traceEventBus
          traceEventBus.publish({
            traceId: options.traceId,
            requestId: options.requestId,
            stage: 'streaming',
            component: 'StreamRuntime',
            status: 'completed',
            metadata: { event: 'chunk', textLength: event.content?.length || 0 }
          });
        }
        onEvent(event);
      }
    });

    onEvent({
      type: 'metadata',
      timestamp: new Date().toISOString(),
      metadata: { state: 'started', sessionId: session.sessionId }
    });
    
    await session.start();

    if (session.status === 'error') {
      throw new Error('Stream generation failed.');
    }
    if (session.status === 'cancelled') {
      return;
    }
  }

  try {
    // 5. Post-Stream Validation: POST_PROVIDER policies
    const finalContent = await runPostProviderGenerationSteps(context, request, accumulatedText);

    // 6. Post-Stream Quality Gates
    const evalResult = await evaluationService.evaluate({
      requestId: options.requestId,
      creatorId,
      sessionId: options.traceId,
      stage: EvaluationStage.GENERATION,
      provider: request.provider,
      model: request.model,
      metadata: {
        inputPrompt: preResult.finalTopic,
        generatedContent: finalContent,
        tenantId: options.tenantId,
        workspaceId
      }
    });

    const isFail = evalResult.decision === 'FAIL';
    const isStrict = evalFeatureFlags.STRICT_EVALUATION;
    const isBlock = evalFeatureFlags.BLOCK_ON_FAIL;

    if (evalResult.status === EvaluationStatus.FAILED && isStrict) {
      throw new EvaluationRuntimeError(`Evaluation failed: ${evalResult.errorMessage || 'Unknown error'}`);
    }

    if (isFail && isBlock) {
      throw new QualityGateError(`Quality gate failed: Score ${evalResult.overallScore} is below thresholds.`);
    }

    // 7. Database Persistence
    if (providerFeatureFlags.PROVIDERS_ENABLED) {
      responseData = {
        scriptDraft: finalContent,
        generatedContent: finalContent,
        content: finalContent
      };
    } else {
      if (responseData) {
        if (responseData.scriptDraft !== undefined) responseData.scriptDraft = finalContent;
        if (responseData.generatedContent !== undefined) responseData.generatedContent = finalContent;
        if (responseData.content !== undefined) responseData.content = finalContent;
        if (responseData.script !== undefined) responseData.script = finalContent;
      }
    }

    const response: GenerationResponse = {
      content: finalContent,
      data: responseData
    };

    // 8. Cache response on success
    await cachingMiddleware.after(context, request, response);

    // Trace completion
    const durationMs = Date.now() - (session ? session.startTime : context.startTime);
    const tokenCount = accumulatedText.split(/\s+/).length;
    const firstTokenLatency = session ? (session.firstTokenTime ? (session.firstTokenTime - session.startTime) : durationMs) : (durationMs / 10);

    traceEventBus.publish({
      traceId: options.traceId,
      requestId: options.requestId,
      stage: 'streaming',
      component: 'StreamRuntime',
      status: 'completed',
      latencyMs: durationMs,
      metadata: {
        firstTokenLatency,
        completionLatency: durationMs,
        tokenCount: session ? session.tokenCount : tokenCount,
        projectId: responseData?.projectId
      }
    });

    // Send final completion SSE payload with response database info
    onEvent({
      type: 'completion',
      timestamp: new Date().toISOString(),
      metadata: {
        durationMs,
        tokenCount: session ? session.tokenCount : tokenCount,
        responseData
      }
    });

  } catch (err: any) {
    if (!session || session.status !== 'cancelled') {
      traceEventBus.publish({
        traceId: options.traceId,
        requestId: options.requestId,
        stage: 'streaming',
        component: 'StreamRuntime',
        status: 'failed',
        metadata: { error: err.message }
      });

      // Send terminal error payload
      const isQualityGate = err.name === 'QualityGateError' || err.message.includes('Quality gate failed');
      const isPolicy = err.name === 'PolicyError' || err.message.includes('Policy Denied');
      
      let sanitizedMessage = 'An error occurred during content generation.';
      if (isPolicy) {
        sanitizedMessage = err.message;
      } else if (isQualityGate) {
        sanitizedMessage = 'Content quality gate check failed.';
      }

      onEvent({
        type: 'error',
        content: sanitizedMessage,
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }
}

export { getContextAssemblyRuntime };
