import test from 'node:test';
import assert from 'node:assert';
import { 
  StreamRuntime, 
  DefaultStreamAdapter, 
  WordChunkingStrategy, 
  SentenceChunkingStrategy, 
  FixedSizeChunkingStrategy, 
  StreamSessionController,
  featureFlags
} from '../index';
import { ProviderRegistry, MockProvider, DefaultProviderResolver } from '../../providers';

test('AI Streaming Runtime Test Suite', async (t) => {

  await t.test('1. StreamAdapter Normalization', () => {
    const adapter = new DefaultStreamAdapter();
    
    // Normal chunk
    const e1 = adapter.normalize({ content: 'hello', done: false });
    assert.strictEqual(e1.type, 'token');
    assert.strictEqual(e1.content, 'hello');

    // Done chunk
    const e2 = adapter.normalize({ content: '', done: true });
    assert.strictEqual(e2.type, 'completion');
  });

  await t.test('2. Chunking Strategies', () => {
    const wordStrat = new WordChunkingStrategy();
    assert.deepStrictEqual(
      wordStrat.chunk('Hello world. Test!'),
      ['Hello', ' ', 'world.', ' ', 'Test!']
    );

    const sentenceStrat = new SentenceChunkingStrategy();
    assert.deepStrictEqual(
      sentenceStrat.chunk('Hello world. How are you? Fine!'),
      ['Hello world. ', 'How are you? ', 'Fine!']
    );

    const fixedStrat = new FixedSizeChunkingStrategy(4);
    assert.deepStrictEqual(
      fixedStrat.chunk('abcdefghij'),
      ['abcd', 'efgh', 'ij']
    );
  });

  await t.test('3. Heartbeat & Controller Lifecycle States', async () => {
    const runStream = async (signal: AbortSignal, controller: StreamSessionController) => {
      // Emit a few tokens
      controller.emit({ type: 'token', content: 'tok1', timestamp: new Date().toISOString() });
      controller.heartbeat(); // Active state heartbeat
      controller.emit({ type: 'token', content: 'tok2', timestamp: new Date().toISOString() });
    };

    const session = new StreamSessionController(
      'sess-1', 'trace-1', 'req-1',
      runStream,
      true // heartbeat enabled
    );

    const events: any[] = [];
    session.subscribe({
      onEvent: (evt) => events.push(evt)
    });

    await session.start();

    // Assert states
    assert.strictEqual(session.status, 'completed');
    assert.strictEqual(session.tokenCount, 2);
    
    const heartbeatEvt = events.find(e => e.type === 'heartbeat');
    assert.ok(heartbeatEvt);
  });

  await t.test('4. Abort Signal Cancellation Support', async () => {
    let signalReceived = false;
    const runStream = async (signal: AbortSignal, controller: StreamSessionController) => {
      for (let i = 0; i < 100; i++) {
        if (signal.aborted) {
          signalReceived = true;
          throw new Error('Cancelled');
        }
        controller.emit({ type: 'token', content: 't', timestamp: new Date().toISOString() });
        // yield control to allow cancel call
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    };

    const session = new StreamSessionController(
      'sess-2', 'trace-2', 'req-2',
      runStream,
      false
    );

    session.subscribe({
      onEvent: (evt) => {
        if (session.tokenCount === 5) {
          session.cancel();
        }
      }
    });

    await session.start();
    assert.strictEqual(session.status, 'cancelled');
    assert.strictEqual(signalReceived, true);
  });

  await t.test('5. Non-Streaming Provider Fallback Generation', async () => {
    const registry = new ProviderRegistry();
    const resolver = new DefaultProviderResolver(registry);
    
    const mockNonStream = new MockProvider();
    mockNonStream.name = 'non-stream-llm';
    mockNonStream.setCapabilities({ streaming: false });
    mockNonStream.setMockResponse('This is standard generated content text.');
    registry.register(mockNonStream);

    const adapter = new DefaultStreamAdapter();
    const chunking = new WordChunkingStrategy();
    const runtime = new StreamRuntime(resolver, adapter, chunking);

    const session = runtime.createSession({
      prompt: 'hi',
      provider: 'non-stream-llm'
    });

    const tokens: string[] = [];
    session.subscribe({
      onEvent: (evt) => {
        if (evt.type === 'token') {
          tokens.push(evt.content || '');
        }
      }
    });

    await session.start();

    // Reconstruct tokens
    const textResult = tokens.join('');
    assert.strictEqual(textResult, 'This is standard generated content text.');
  });

  await t.test('6. Pause & Resume Stream Status', () => {
    const session = new StreamSessionController(
      'sess-3', 'trace-3', 'req-3',
      async () => {},
      false
    );

    assert.strictEqual(session.status, 'active');
    
    session.pause();
    assert.strictEqual(session.status, 'paused');

    session.resume();
    assert.strictEqual(session.status, 'active');
  });

  await t.test('7. Telemetry Trace Metrics Appending', async () => {
    const registry = new ProviderRegistry();
    const resolver = new DefaultProviderResolver(registry);
    
    const mock = new MockProvider();
    mock.name = 'native-stream-llm';
    mock.setMockResponse('Sample native stream tokens.');
    registry.register(mock);

    const adapter = new DefaultStreamAdapter();
    const chunking = new WordChunkingStrategy();
    const runtime = new StreamRuntime(resolver, adapter, chunking);

    const session = runtime.createSession({
      prompt: 'hi',
      provider: 'native-stream-llm'
    });

    const events: any[] = [];
    session.subscribe({
      onEvent: (evt) => events.push(evt)
    });

    await session.start();

    const metadataEvent = events.find(e => e.type === 'metadata' && e.metadata?.streamId);
    assert.ok(metadataEvent);
    const meta = metadataEvent.metadata;
    assert.strictEqual(meta.provider, 'native-stream-llm');
    assert.ok(meta.firstTokenLatency >= 0);
    assert.ok(meta.completionLatency >= 0);
    assert.ok(meta.tokenCount > 0);
  });

});
