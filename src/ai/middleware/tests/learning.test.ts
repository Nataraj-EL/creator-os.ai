import test from 'node:test';
import assert from 'node:assert';
import { 
  MemoryExtractor, 
  MemoryDecision, 
  DefaultMemoryLearningService, 
  MemoryLearningDispatcher, 
  LearningLifecycleEvent,
  extractionFeatureFlags
} from '../../memory/extraction';
import { MemoryLearningMiddleware } from '../builtins';
import { MemoryType } from '../../memory/types';

// Mock MemoryService search and store handlers
const mockMemoryService: any = {
  storedCount: 0,
  storedRecords: [] as any[],

  async store(context: any, content: string, tags: string[], type: any, options: any) {
    this.storedCount++;
    this.storedRecords.push({ content, tags, type, options });
    return {} as any;
  },

  async search() {
    return [];
  },

  clear() {
    this.storedCount = 0;
    this.storedRecords = [];
  }
};

// Mock dispatcher tracking execution delays
class MockDispatcher implements MemoryLearningDispatcher {
  public executedCount = 0;
  public tasks: Array<() => Promise<void>> = [];

  public dispatch(task: () => Promise<void>): void {
    this.tasks.push(task);
  }

  public async executeAll() {
    for (const t of this.tasks) {
      await t();
      this.executedCount++;
    }
    this.tasks = [];
  }
}

test('AI Automatic Memory Learning Pipeline Integration Suite', async (t) => {

  const originalAuto = extractionFeatureFlags.AUTO_MEMORY_LEARNING;
  const originalUpdate = extractionFeatureFlags.AUTO_MEMORY_UPDATE;
  const originalExtract = extractionFeatureFlags.MEMORY_EXTRACTION;
  const originalPolicy = extractionFeatureFlags.MEMORY_POLICIES;

  t.beforeEach(() => {
    mockMemoryService.clear();
    extractionFeatureFlags.AUTO_MEMORY_LEARNING = true;
    extractionFeatureFlags.AUTO_MEMORY_UPDATE = true;
    extractionFeatureFlags.MEMORY_EXTRACTION = true;
    extractionFeatureFlags.MEMORY_POLICIES = false; // Auto approve
  });

  t.afterEach(() => {
    extractionFeatureFlags.AUTO_MEMORY_LEARNING = originalAuto;
    extractionFeatureFlags.AUTO_MEMORY_UPDATE = originalUpdate;
    extractionFeatureFlags.MEMORY_EXTRACTION = originalExtract;
    extractionFeatureFlags.MEMORY_POLICIES = originalPolicy;
    mockMemoryService.clear();
  });

  await t.test('1. Service DI & Background Dispatcher - registers dependencies and runs fire-and-forget tasks', async () => {
    const extractor = new MemoryExtractor(mockMemoryService);
    const dispatcher = new MockDispatcher();
    const service = new DefaultMemoryLearningService(extractor, dispatcher);

    const context = { userId: 'creator-123', requestId: 'req-unique-01' };
    
    // learn() returns immediately
    const results = await service.learn(context, 'I prefer scriptwriting.', 'Completed script draft.');
    assert.strictEqual(results.length, 0);

    // Verify task is queued inside the mock dispatcher and NOT run yet
    assert.strictEqual(dispatcher.executedCount, 0);
    assert.strictEqual(mockMemoryService.storedCount, 0);

    // Execute background queue
    await dispatcher.executeAll();
    assert.strictEqual(dispatcher.executedCount, 1);
    assert.strictEqual(mockMemoryService.storedCount, 1);
    assert.strictEqual(mockMemoryService.storedRecords[0].content, 'User preference: scriptwriting');
  });

  await t.test('2. Idempotency Check - protects against duplicate request/trace ID learning', async () => {
    const extractor = new MemoryExtractor(mockMemoryService);
    const dispatcher = new MockDispatcher();
    const service = new DefaultMemoryLearningService(extractor, dispatcher);

    const context = { userId: 'creator-123', requestId: 'req-dup-101', sessionId: 'trace-dup-101' };

    // Trigger learning 3 times consecutively for same context
    await service.learn(context, 'I prefer scripting.', 'Content 1.');
    await service.learn(context, 'I prefer scripting.', 'Content 2.');
    await service.learn(context, 'I prefer scripting.', 'Content 3.');

    // Only one background task should have been dispatched
    assert.strictEqual(dispatcher.tasks.length, 1);

    await dispatcher.executeAll();
    assert.strictEqual(mockMemoryService.storedCount, 1);
  });

  await t.test('3. Decision Options Storage - only ACCEPT/UPDATE/MERGE choices modify database storage', async () => {
    const mockDecisionEngine = {
      name: 'MockDecisionEngine',
      decision: MemoryDecision.REJECT,
      resolve() {
        return this.decision;
      }
    };

    const extractor = new MemoryExtractor(mockMemoryService, mockDecisionEngine as any);
    const dispatcher = new MockDispatcher();
    const service = new DefaultMemoryLearningService(extractor, dispatcher);
    const context = { userId: 'creator-123', requestId: 'req-dec-1' };

    // Case A: REJECT decision
    mockDecisionEngine.decision = MemoryDecision.REJECT;
    await service.learn(context, 'I prefer scripting.', 'Content.');
    await dispatcher.executeAll();
    assert.strictEqual(mockMemoryService.storedCount, 0);

    // Case B: IGNORE decision
    mockDecisionEngine.decision = MemoryDecision.IGNORE;
    await service.learn({ ...context, requestId: 'req-dec-2' }, 'I prefer scripting.', 'Content.');
    await dispatcher.executeAll();
    assert.strictEqual(mockMemoryService.storedCount, 0);

    // Case C: UPDATE_EXISTING decision
    mockDecisionEngine.decision = MemoryDecision.UPDATE_EXISTING;
    await service.learn({ ...context, requestId: 'req-dec-3' }, 'I prefer scripting.', 'Content.');
    await dispatcher.executeAll();
    assert.strictEqual(mockMemoryService.storedCount, 1);

    // Case D: MERGE decision
    mockDecisionEngine.decision = MemoryDecision.MERGE;
    await service.learn({ ...context, requestId: 'req-dec-4' }, 'I prefer scripting.', 'Content.');
    await dispatcher.executeAll();
    assert.strictEqual(mockMemoryService.storedCount, 2);
  });

  await t.test('4. Lifecycle Tracing Events - broadcasts metrics on completed background cycles', async () => {
    const extractor = new MemoryExtractor(mockMemoryService);
    const dispatcher = new MockDispatcher();
    const service = new DefaultMemoryLearningService(extractor, dispatcher);
    const context = { userId: 'creator-123', requestId: 'req-evt-1' };

    const events: LearningLifecycleEvent[] = [];
    service.addListener((evt) => {
      events.push(evt);
    });

    await service.learn(context, 'I prefer styling.', 'Content guidelines.');
    await dispatcher.executeAll();

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].type, 'MEMORY_LEARNING_STARTED');
    assert.strictEqual(events[1].type, 'MEMORY_LEARNING_COMPLETED');
    assert.ok(events[1].details.latency >= 0);
    assert.strictEqual(events[1].details.resultsCount, 1);
    assert.strictEqual(events[1].details.storedMemoryContents[0], 'User preference: styling');
  });

  await t.test('5. Middleware Fail-Open Path - catch extractor failures gracefully without affecting middleware loops', async () => {
    // Stub learning service to throw an exception
    const throwingService: any = {
      learn: async () => {
        throw new Error("Learning service database connection offline.");
      }
    };

    const middleware = new MemoryLearningMiddleware(throwingService);
    const ctx: any = { creatorId: 'creator-123', requestId: 'req-err-1' };
    const req: any = { prompt: 'Write tone style' };
    const res: any = { content: 'Mock generated text styling.' };

    // execute after() hook
    await middleware.after(ctx, req, res);

    // If it reaches here without throwing, fail-open is working correctly!
    assert.ok(true);
  });

  await t.test('6. Backward Compatibility - constructs cleanly without DI arguments', () => {
    const middleware = new MemoryLearningMiddleware();
    assert.ok(middleware.metadata);
    assert.strictEqual(middleware.priority, 20);
  });

});
