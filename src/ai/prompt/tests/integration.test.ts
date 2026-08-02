import test from 'node:test';
import assert from 'node:assert';
import { apiClient } from '../../../lib/api-client';
import { generateContent, getContextAssemblyRuntime } from '../../../lib/generationService';
import { PromptBuilder, promptFeatureFlags } from '../index';
import { contextFeatureFlags } from '../../context/config/featureFlags';
import { memoryFeatureFlags, MemoryType, MemoryRepositoryFactory, memoryProviderRegistry, CreatorMemoryProvider } from '../../memory';
import { ContextResult, ContextStrategy } from '../../context/types';

test('AI Prompt Context-Aware Integration Suite', async (t) => {

  const originalInj = promptFeatureFlags.CONTEXT_INJECTION;
  const originalBld = promptFeatureFlags.PROMPT_BUILDER;
  const originalCtx = contextFeatureFlags.CONTEXT_ENABLED;
  const originalMem = memoryFeatureFlags.MEMORY_ENABLED;
  const originalRead = memoryFeatureFlags.MEMORY_READ;
  const originalWrite = memoryFeatureFlags.MEMORY_WRITE;

  // Stubs for Axios POST requests
  let lastPostPayload: any = null;
  const originalPost = apiClient.post;

  t.beforeEach(() => {
    MemoryRepositoryFactory.clear();
    const repo = MemoryRepositoryFactory.getRepository();
    repo.save({
      id: 'mem-user-tone',
      creatorId: 'creator-999',
      content: 'Creator prefers a sarcastic humorous tone.',
      tags: ['style'],
      type: MemoryType.BRAND,
      importance: 8,
      source: 'user',
      confidence: 1.0,
      lastAccessed: new Date().toISOString(),
      accessCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {}
    });

    const provider = new CreatorMemoryProvider(repo);
    memoryProviderRegistry.clear();
    memoryProviderRegistry.register(provider);

    (apiClient as any).post = async (url: string, data?: any, config?: any) => {
      lastPostPayload = data;
      return {
        data: {
          scriptDraft: 'Mock generated script based on injected prompt.',
          success: true
        }
      };
    };
  });

  t.afterEach(() => {
    promptFeatureFlags.CONTEXT_INJECTION = originalInj;
    promptFeatureFlags.PROMPT_BUILDER = originalBld;
    contextFeatureFlags.CONTEXT_ENABLED = originalCtx;
    memoryFeatureFlags.MEMORY_ENABLED = originalMem;
    memoryFeatureFlags.MEMORY_READ = originalRead;
    memoryFeatureFlags.MEMORY_WRITE = originalWrite;
    apiClient.post = originalPost;
    MemoryRepositoryFactory.clear();
    memoryProviderRegistry.clear();
  });

  await t.test('1. Prompt Package Composition - builds PromptPackage structure', () => {
    const contextResult: ContextResult = {
      requestId: 'req-ctx-1',
      blocks: [
        {
          id: 'mem-1',
          content: 'Test content',
          source: 'memory',
          relevanceScore: 0.9,
          importance: 5,
          timestamp: new Date().toISOString(),
          tokenCount: 3,
          selectionReason: 'Ranked high',
          metadata: {}
        }
      ],
      totalTokens: 3,
      tokenBudget: 2000,
      strategy: ContextStrategy.SEMANTIC_FIRST
    };

    const promptPackage = PromptBuilder.build('User request', contextResult, {
      systemInstructions: 'System command override',
      promptVersion: '1.2.3'
    });

    assert.strictEqual(promptPackage.systemInstructions, 'System command override');
    assert.strictEqual(promptPackage.userPrompt, 'User request');
    assert.strictEqual(promptPackage.contextBlocks.length, 1);
    assert.ok(promptPackage.contextBlocks[0].includes('Test content'));
    assert.strictEqual(promptPackage.metadata.promptVersion, '1.2.3');
  });

  await t.test('2. Context Injection - resolves PromptPackage and adapts payload to Axios POST', async () => {
    // Enable features
    promptFeatureFlags.CONTEXT_INJECTION = true;
    promptFeatureFlags.PROMPT_BUILDER = true;
    contextFeatureFlags.CONTEXT_ENABLED = true;
    memoryFeatureFlags.MEMORY_ENABLED = true;
    memoryFeatureFlags.MEMORY_READ = true;
    memoryFeatureFlags.MEMORY_WRITE = true;

    const res = await generateContent(
      'creator-999',
      'workspace-abc',
      'Script Title',
      'Write a video script about tech style',
      'Engagement'
    );

    assert.ok(res.data.success);
    assert.strictEqual(res.data.scriptDraft, 'Mock generated script based on injected prompt.');

    // Assert Axios POST payload: topic contains the injected prompt package
    assert.ok(lastPostPayload);
    assert.ok(lastPostPayload.topic.includes('Creator prefers a sarcastic humorous tone.'));
    assert.ok(lastPostPayload.topic.includes('Write a video script about tech style'));
  });

  await t.test('3. Fail-Open Fallback - runs raw fallback if context injection throws', async () => {
    promptFeatureFlags.CONTEXT_INJECTION = true;
    promptFeatureFlags.PROMPT_BUILDER = true;
    contextFeatureFlags.CONTEXT_ENABLED = true;
    memoryFeatureFlags.MEMORY_ENABLED = true;
    memoryFeatureFlags.MEMORY_READ = true;
    memoryFeatureFlags.MEMORY_WRITE = true;

    // Stub search inside the assembly runtime to throw an error
    const assembler = getContextAssemblyRuntime();
    const originalSearch = assembler['memoryService'].search;
    assembler['memoryService'].search = async () => {
      throw new Error("Simulated memory lookup failure");
    };

    try {
      const res = await generateContent(
        'creator-999',
        'workspace-abc',
        'Script Title',
        'Write a video script about tech style',
        'Engagement'
      );

      // Generation succeeds fail-open
      assert.ok(res.data.success);
      // Transmitted topic is untouched raw query
      assert.strictEqual(lastPostPayload.topic, 'Write a video script about tech style');
    } finally {
      assembler['memoryService'].search = originalSearch;
    }
  });

  await t.test('4. API Format Consistency - response mapping shapes are unchanged', async () => {
    promptFeatureFlags.CONTEXT_INJECTION = false;

    const res = await generateContent(
      'creator-999',
      'workspace-abc',
      'Script Title',
      'Write a video script about tech style',
      'Engagement'
    );

    assert.ok(res.data.success);
    assert.strictEqual(lastPostPayload.topic, 'Write a video script about tech style');
  });

});
