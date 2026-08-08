import crypto from 'crypto';

export function buildCacheKey(
  context: { tenantId?: string; workspaceId?: string; creatorId?: string },
  request: { provider: string; model: string; prompt: string; inputs?: Record<string, any>; options?: Record<string, any> },
  promptVersion?: string
): string {
  const tenantId = context.tenantId;
  const workspaceId = context.workspaceId;
  const creatorId = context.creatorId;
  
  if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
    throw new Error('Invalid tenant/workspace context for cache key generation.');
  }

  // Normalize prompt input, inputs and relevant configuration while stripping secrets
  const cleanInputs = request.inputs ? { ...request.inputs } : {};
  const cleanOptions = {
    temperature: request.options?.temperature,
    maxTokens: request.options?.maxTokens,
    topP: request.options?.topP,
    frequencyPenalty: request.options?.frequencyPenalty,
    presencePenalty: request.options?.presencePenalty
  };

  const serializedInput = JSON.stringify({
    prompt: request.prompt,
    inputs: cleanInputs,
    options: cleanOptions
  });

  const promptHash = crypto.createHash('sha256').update(serializedInput).digest('hex');

  const segments = [
    'ai-cache',
    tenantId,
    workspaceId,
    creatorId || 'system',
    request.provider,
    request.model,
    promptVersion || 'v1',
    promptHash
  ];

  return segments.join(':');
}
