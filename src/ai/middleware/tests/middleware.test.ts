import test from 'node:test';
import assert from 'node:assert';
import { 
  AIMiddlewareRunner,
  AIMiddleware, 
  AIRequest, 
  AIResponse, 
  AIContext, 
  MiddlewareAction, 
  AIHandler,
  EvaluationMiddleware 
} from '../index';
import { EvaluationStatus } from '../../evaluation/types';

test('AI Middleware Runtime Suite', async (t) => {

  await t.test('1. Priority Ordering - higher priority runs first in before hooks', async () => {
    const runner = new AIMiddlewareRunner();
    const runOrder: string[] = [];

    const lowPriorityMw: AIMiddleware = {
      metadata: { name: 'LowPriority', version: '1.0', description: '' },
      priority: 10,
      before: () => { runOrder.push('low'); }
    };

    const highPriorityMw: AIMiddleware = {
      metadata: { name: 'HighPriority', version: '1.0', description: '' },
      priority: 100,
      before: () => { runOrder.push('high'); }
    };

    runner.use(lowPriorityMw);
    runner.use(highPriorityMw);

    const context = { creatorId: 'dev-1', stage: 'test', pipeline: 'generation', metadata: {} };
    const request = { provider: 'Mock', model: 'mock-model', prompt: 'test' };
    const mockHandler: AIHandler<AIRequest, AIResponse> = {
      handle: async () => ({ content: 'success' })
    };

    await runner.run(context, request, mockHandler);
    
    // High (100) should run before Low (10)
    assert.deepStrictEqual(runOrder, ['high', 'low']);
  });

  await t.test('2. Short-Circuit Action - returning STOP from before hook skips the core handler', async () => {
    const runner = new AIMiddlewareRunner();
    let handlerCalled = false;

    const stopMw: AIMiddleware = {
      metadata: { name: 'StopMw', version: '1.0', description: '' },
      priority: 50,
      before: (context) => {
        context.metadata.response = { content: 'cached-content' };
        return MiddlewareAction.STOP;
      }
    };

    const nextMw: AIMiddleware = {
      metadata: { name: 'NextMw', version: '1.0', description: '' },
      priority: 40,
      before: () => { /* Should not be run */ }
    };

    runner.use(stopMw);
    runner.use(nextMw);

    const context = { creatorId: 'dev-1', stage: 'test', pipeline: 'generation', metadata: {} };
    const request = { provider: 'Mock', model: 'mock-model', prompt: 'test' };
    const mockHandler: AIHandler<AIRequest, AIResponse> = {
      handle: async () => {
        handlerCalled = true;
        return { content: 'handler-content' };
      }
    };

    const res = await runner.run(context, request, mockHandler);
    
    assert.strictEqual(handlerCalled, false);
    assert.strictEqual(res.content, 'cached-content');
  });

  await t.test('3. Finally Lifecycle - executes finally hook on both success and error', async () => {
    const runner = new AIMiddlewareRunner();
    let finallyCalled = 0;

    const finallyMw: AIMiddleware = {
      metadata: { name: 'FinallyMw', version: '1.0', description: '' },
      priority: 50,
      finally: () => { finallyCalled++; }
    };

    runner.use(finallyMw);

    const context = { creatorId: 'dev-1', stage: 'test', pipeline: 'generation', metadata: {} };
    const request = { provider: 'Mock', model: 'mock-model', prompt: 'test' };
    
    // 1. Test success path
    const successHandler: AIHandler<AIRequest, AIResponse> = {
      handle: async () => ({ content: 'ok' })
    };
    await runner.run(context, request, successHandler);
    assert.strictEqual(finallyCalled, 1);

    // 2. Test error path
    const errorHandler: AIHandler<AIRequest, AIResponse> = {
      handle: async () => { throw new Error('Handler Fail'); }
    };
    try {
      await runner.run(context, request, errorHandler);
    } catch (e) {
      // Expected exception
    }
    assert.strictEqual(finallyCalled, 2);
  });

  await t.test('4. Async Hook Awaiting - hooks are awaited sequentially', async () => {
    const runner = new AIMiddlewareRunner();
    const runOrder: string[] = [];

    const asyncMw: AIMiddleware = {
      metadata: { name: 'AsyncMw', version: '1.0', description: '' },
      priority: 50,
      before: async () => {
        await new Promise(r => setTimeout(r, 100));
        runOrder.push('async-done');
      }
    };

    runner.use(asyncMw);

    const context = { creatorId: 'dev-1', stage: 'test', pipeline: 'generation', metadata: {} };
    const request = { provider: 'Mock', model: 'mock-model', prompt: 'test' };
    const handler: AIHandler<AIRequest, AIResponse> = {
      handle: async () => {
        runOrder.push('handler-run');
        return { content: 'ok' };
      }
    };

    await runner.run(context, request, handler);
    assert.deepStrictEqual(runOrder, ['async-done', 'handler-run']);
  });

  await t.test('5. Evaluation Service Injection - calls evaluate on completion', async () => {
    const runner = new AIMiddlewareRunner();
    let evaluateCalled = false;

    // Create a mock EvaluationService
    const mockEvalService: any = {
      evaluate: async (evalContext: any) => {
        evaluateCalled = true;
        return {
          evaluationId: 'test-eval-id',
          context: evalContext,
          status: EvaluationStatus.COMPLETED,
          metrics: [],
          overallScore: 90,
          latencyMs: 10,
          createdAt: new Date().toISOString()
        };
      }
    };

    const evalMiddleware = new EvaluationMiddleware(mockEvalService);
    runner.use(evalMiddleware);

    const context = { creatorId: 'dev-1', stage: 'test-stage', pipeline: 'generation', metadata: {} };
    const request = { provider: 'Mock', model: 'mock-model', prompt: 'Write an article.' };
    const handler: AIHandler<AIRequest, AIResponse> = {
      handle: async () => ({ content: 'Highly rated draft content.' })
    };

    await runner.run(context, request, handler);

    // Allow async microtask queue to flush since evaluate is called in fire-and-forget catch-handler
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(evaluateCalled, true);
  });
});
