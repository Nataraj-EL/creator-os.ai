import { ContextResult } from '../context/types';
import { traceEventBus } from '../observability';

export interface PromptPackage {
  systemInstructions: string;
  contextBlocks: string[];
  userPrompt: string;
  metadata: Record<string, any>;
}

export interface PromptBuilderOptions {
  systemInstructions?: string;
  promptVersion?: string;
}

export class PromptBuilder {
  public static build(
    userPrompt: string,
    contextResult: ContextResult,
    options?: PromptBuilderOptions
  ): PromptPackage {
    const defaultInstructions = "You are CreatorOS AI, a helpful writing assistant.";
    const systemInstructions = options?.systemInstructions || defaultInstructions;
    const promptVersion = options?.promptVersion || "1.0.0";

    // Format ContextBlock instances into simple context block strings
    const contextBlocks = contextResult.blocks.map(block => {
      const reasonTag = block.selectionReason ? ` [Reason: ${block.selectionReason}]` : '';
      return `[Source: ${block.source} | ID: ${block.id}]${reasonTag}\n${block.content}`;
    });

    traceEventBus.publish({
      traceId: contextResult.metadata?.traceId || '',
      requestId: contextResult.requestId || '',
      stage: 'prompt-builder',
      component: 'PromptBuilder',
      status: 'completed',
      metadata: { promptVersion, strategy: contextResult.strategy, blocksCount: contextResult.blocks.length }
    });

    return {
      systemInstructions,
      contextBlocks,
      userPrompt,
      metadata: {
        promptVersion,
        requestId: contextResult.requestId,
        strategy: contextResult.strategy,
        blocksCount: contextResult.blocks.length
      }
    };
  }
}
