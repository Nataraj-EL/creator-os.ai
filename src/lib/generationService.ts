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

    // Outbound API request to backend generation endpoint
    const response = await apiClient.post(
      `/api/v1/workspaces/${request.workspaceId}/content`, 
      {
        title: request.title,
        topic: request.topic,
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
