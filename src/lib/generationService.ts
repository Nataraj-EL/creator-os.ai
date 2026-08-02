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
import { memoryProviderRegistry } from '../ai/memory/providers';
import { MemoryRepositoryFactory } from '../ai/memory/storage/repositoryFactory';
import { PromptBuilder, promptFeatureFlags } from '../ai/prompt';
import { RetrievalService } from '../ai/retrieval';

import { StreamRuntime, DefaultStreamAdapter, WordChunkingStrategy } from '../ai/streaming';

// Instantiate and initialize a shared runner instance
export const generationMiddlewareRunner = new AIMiddlewareRunner();

export const streamRuntime = new StreamRuntime(
  providerResolver,
  new DefaultStreamAdapter(),
  new WordChunkingStrategy()
);

// Ensure built-in middlewares are registered exactly once
if (generationMiddlewareRunner.getMiddlewares().length === 0) {
  generationMiddlewareRunner.use(new TraceMiddleware());
  generationMiddlewareRunner.use(new TimingMiddleware());
  generationMiddlewareRunner.use(new LoggingMiddleware());
  generationMiddlewareRunner.use(new MemoryLearningMiddleware());
  generationMiddlewareRunner.use(new EvaluationMiddleware(evaluationService));
  generationMiddlewareRunner.use(new EvaluationRuntimeMiddleware());
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

class GenerationHandler implements AIHandler<GenerationRequest, GenerationResponse> {
  async handle(context: AIContext, request: GenerationRequest): Promise<GenerationResponse> {
    const config: Record<string, any> = {};

    // Propagate requestId and traceId internally as optional trace headers
    if (context.requestId || context.traceId) {
      config.headers = {
        'X-Request-Id': context.requestId,
        'X-Trace-Id': context.traceId
      };
    }

    let finalTopic = request.topic;
    let selectedMemoryIds: string[] = [];
    let promptVersion: string | undefined = undefined;
    let contextResult: any = null;

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

    // Fail-open Context Assembly invocation
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

          // Adapt PromptPackage to provider-specific payload (Axios POST topic field)
          const formattedBlocksStr = promptPackage.contextBlocks.join('\n\n');
          finalTopic = `${promptPackage.systemInstructions}\n\nUse the following relevant context:\n\n${formattedBlocksStr}\n\nUser Prompt: ${promptPackage.userPrompt}`;
        }
      } catch (err) {
        console.error("[AI-GEN] Context injection failed (fail-open):", err);
      }
    }

    let responseData: any;

    if (providerFeatureFlags.PROVIDERS_ENABLED) {
      const provider = providerResolver.resolve(request.provider);
      const retryPolicy = new ExponentialBackoffRetryPolicy(
        3, 
        100, 
        2, 
        providerFeatureFlags.RETRY_ENABLED
      );
      const timeoutPolicy = new DefaultTimeoutPolicy(5000);
      const runtime = new ProviderRuntime(providerRegistry, retryPolicy, timeoutPolicy);

      const providerRequest = {
        prompt: finalTopic,
        model: request.model,
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
        selectedMemoryIds,
        promptVersion,
        variantId,
        contextBlocks: contextResult ? contextResult.blocks : [],
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
        selectedMemoryIds,
        promptVersion,
        variantId,
        contextBlocks: contextResult ? contextResult.blocks : []
      };

      // Outbound API request to backend generation endpoint
      const apiResponse = await apiClient.post(
        `/api/v1/workspaces/${request.workspaceId}/content`, 
        {
          title: request.title,
          topic: finalTopic, // Transformed payload!
          primaryGoal: request.primaryGoal
        },
        config
      );
      responseData = apiResponse.data;
    }

    // Map content for EvaluationMiddleware ingestion
    const rawContent = responseData?.scriptDraft || 
                       responseData?.generatedContent || 
                       responseData?.content || 
                       JSON.stringify(responseData);

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
export { getContextAssemblyRuntime };
