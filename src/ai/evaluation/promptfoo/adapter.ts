export interface PromptfooEvalOptions {
  prompts: string[];
  providers: any[];
  tests: any[];
}

export async function runPromptfooEval(options: PromptfooEvalOptions): Promise<any> {
  if (typeof window !== 'undefined') {
    throw new Error('[PromptfooAdapter] Promptfoo is server-side only and cannot be executed in the browser.');
  }

  let promptfoo: any;
  try {
    // Dynamic import guarantees webpack excludes promptfoo from client-side compilation graphs
    promptfoo = await import('promptfoo');
  } catch (err: any) {
    console.error('[PromptfooAdapter] Failed to dynamically load promptfoo library:', err.message);
    throw new Error(`[PromptfooAdapter] Promptfoo framework is unavailable: ${err.message}`);
  }

  const evaluateFn = promptfoo.evaluate || (promptfoo.default ? promptfoo.default.evaluate : null);
  if (typeof evaluateFn !== 'function') {
    throw new Error('[PromptfooAdapter] promptfoo.evaluate is not resolved as a function.');
  }

  return await evaluateFn(options);
}
