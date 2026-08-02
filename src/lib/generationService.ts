import { apiClient } from './api-client';
import { AIMiddlewareRunner } from '../ai/middleware/runner';
import { 
  TraceMiddleware, 
  TimingMiddleware, 
  LoggingMiddleware, 
  EvaluationMiddleware 
} from '../ai/middleware/builtins';
import { evaluationService } from '../ai/evaluation/services';
import { AIRequest, AIResponse, AIHandler, AIContext } from '../ai/middleware/types';

import { ContextAssemblyRuntime } from '../ai/context/services';
import { MemoryRuntime } from '../ai/memory/services';
import { memoryProviderRegistry } from '../ai/memory/providers';
import { MemoryRepositoryFactory } from '../ai/memory/storage/repositoryFactory';
import { PromptBuilder, promptFeatureFlags } from '../ai/prompt';

// Instantiate and initialize a shared runner instance
export const generationMiddlewareRunner = new AIMiddlewareRunner();

// Ensure built-in middlewares are registered exactly once
if (generationMiddlewareRunner.getMiddlewares().length === 0) {
  generationMiddlewareRunner.use(new TraceMiddleware());
  generationMiddlewareRunner.use(new TimingMiddleware());
  generationMiddlewareRunner.use(new LoggingMiddleware());
  generationMiddlewareRunner.use(new EvaluationMiddleware(evaluationService));
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
    contextAssemblyRuntimeInstance = new ContextAssemblyRuntime(memoryRuntime);
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

    // Fail-open Context Assembly invocation
    if (promptFeatureFlags.CONTEXT_INJECTION) {
      try {
        const assembler = getContextAssemblyRuntime();
        const promptString = `Topic: ${request.topic} | Title: ${request.title} | Goal: ${request.primaryGoal}`;
        
        const contextResult = await assembler.assemble({
          userId: context.creatorId,
          prompt: promptString,
          tokenBudget: 2000,
          metadata: { requestId: context.requestId, traceId: context.traceId }
        });

        selectedMemoryIds = contextResult.blocks.map(b => b.id);

        if (promptFeatureFlags.PROMPT_BUILDER) {
          const promptPackage = PromptBuilder.build(request.topic, contextResult, {
            systemInstructions: `You are CreatorOS AI content generator. Title: ${request.title}. Primary Goal: ${request.primaryGoal}.`
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

    // Propagate ID arrays and prompt version to shared context metadata
    context.metadata = {
      ...context.metadata,
      selectedMemoryIds,
      promptVersion
    };

    // Outbound API request to backend generation endpoint
    const response = await apiClient.post(
      `/api/v1/workspaces/${request.workspaceId}/content`, 
      {
        title: request.title,
        topic: finalTopic, // Transformed payload!
        primaryGoal: request.primaryGoal
      },
      config
    );

    // Map content for EvaluationMiddleware ingestion
    const rawContent = response.data?.scriptDraft || 
                       response.data?.generatedContent || 
                       response.data?.content || 
                       JSON.stringify(response.data);

    return {
      content: rawContent,
      data: response.data
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
