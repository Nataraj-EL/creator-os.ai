import test from 'node:test';
import assert from 'node:assert';
import { 
  MemoryExtractor, 
  DefaultMemoryDecisionEngine, 
  ImportancePolicy, 
  DuplicatePolicy, 
  FreshnessPolicy, 
  extractionFeatureFlags, 
  MemoryDecision, 
  ExtractionLifecycleEvent
} from '../index';
import { MemoryType, MemoryRecord } from '../../types';

// Mock MemoryService search and store handlers
const mockMemoryService: any = {
  storedRecords: [] as any[],
  searchResult: [] as MemoryRecord[],
  
  async store(context: any, content: string, tags: string[], type: any, options: any) {
    this.storedRecords.push({ content, tags, type, options });
    return {} as any;
  },

  async search(context: any, query: any) {
    return this.searchResult;
  },

  clear() {
    this.storedRecords = [];
    this.searchResult = [];
  }
};

test('AI Memory Extraction Engine Suite', async (t) => {

  const originalExt = extractionFeatureFlags.MEMORY_EXTRACTION;
  const originalPol = extractionFeatureFlags.MEMORY_POLICIES;

  t.beforeEach(() => {
    mockMemoryService.clear();
  });

  t.afterEach(() => {
    extractionFeatureFlags.MEMORY_EXTRACTION = originalExt;
    extractionFeatureFlags.MEMORY_POLICIES = originalPol;
    mockMemoryService.clear();
  });

  await t.test('1. Heuristics Parser - extracts candidates across categories', async () => {
    extractionFeatureFlags.MEMORY_EXTRACTION = true;
    extractionFeatureFlags.MEMORY_POLICIES = false; // Auto approve

    const extractor = new MemoryExtractor(mockMemoryService);
    const context = { userId: 'user-456' };

    const inputText = 'I prefer quick scripting. Our brand color is green. My channel name is Antigravity. The project title is Sprint 10. The fact is Node is fast.';
    const results = await extractor.extract(context, inputText);

    assert.strictEqual(results.length, 5);

    // Assert Preference candidate
    const prefResult = results.find(r => r.candidate.type === MemoryType.PREFERENCE);
    assert.ok(prefResult);
    assert.strictEqual(prefResult.candidate.content, 'User preference: quick scripting');
    assert.strictEqual(prefResult.decision, MemoryDecision.ACCEPT);

    // Assert Brand candidate
    const brandResult = results.find(r => r.candidate.type === MemoryType.BRAND);
    assert.ok(brandResult);
    assert.strictEqual(brandResult.candidate.content, 'Brand constraint: green');

    // Assert Profile candidate
    const profileResult = results.find(r => r.candidate.type === MemoryType.PROFILE);
    assert.ok(profileResult);
    assert.strictEqual(profileResult.candidate.content, 'Creator profile detail: channel is Antigravity');

    // Assert Project candidate
    const projectResult = results.find(r => r.candidate.type === MemoryType.PROJECT);
    assert.ok(projectResult);
    assert.strictEqual(projectResult.candidate.content, 'Project metadata: title is Sprint 10');

    // Assert Knowledge candidate
    const knowledgeResult = results.find(r => r.candidate.type === MemoryType.KNOWLEDGE);
    assert.ok(knowledgeResult);
    assert.strictEqual(knowledgeResult.candidate.content, 'Fact statement: Node is fast');

    // Confirms all 5 accepted entries wrote to MemoryService
    assert.strictEqual(mockMemoryService.storedRecords.length, 5);
  });

  await t.test('2. Pluggable Policies - evaluates candidates, yielding structured PolicyResult metrics', async () => {
    extractionFeatureFlags.MEMORY_EXTRACTION = true;
    extractionFeatureFlags.MEMORY_POLICIES = true;

    // Load policies
    const importancePolicy = new ImportancePolicy(6); // min 6
    const freshnessPolicy = new FreshnessPolicy(0.8); // min 0.8
    const extractor = new MemoryExtractor(mockMemoryService, undefined, [importancePolicy, freshnessPolicy]);

    const context = { userId: 'user-456' };

    // 1. Candidate below importance threshold
    // "The fact is Node is fast." -> importance 5 (rejected by ImportancePolicy)
    const resLowImp = await extractor.extract(context, 'The fact is Node is fast.');
    assert.strictEqual(resLowImp.length, 1);
    assert.strictEqual(resLowImp[0].decision, MemoryDecision.REJECT);
    
    const impResult = resLowImp[0].policyResults.find(p => p.policyName === 'ImportancePolicy');
    assert.ok(impResult);
    assert.strictEqual(impResult.approved, false);
    assert.strictEqual(impResult.score, 0.5);

    // 2. Candidate passing both
    // "Our brand color is red." -> importance 8, confidence 0.95 (both approved)
    const resApproved = await extractor.extract(context, 'Our brand color is red.');
    assert.strictEqual(resApproved.length, 1);
    assert.strictEqual(resApproved[0].decision, MemoryDecision.ACCEPT);
  });

  await t.test('3. Decision Engine - duplicate policies yield MemoryDecision.IGNORE', async () => {
    extractionFeatureFlags.MEMORY_EXTRACTION = true;
    extractionFeatureFlags.MEMORY_POLICIES = true;

    const duplicatePolicy = new DuplicatePolicy(mockMemoryService);
    const extractor = new MemoryExtractor(mockMemoryService, new DefaultMemoryDecisionEngine(), [duplicatePolicy]);
    const context = { userId: 'user-456' };

    // Mock search returning exact duplicate
    mockMemoryService.searchResult = [
      {
        id: 'mem-dup-1',
        creatorId: 'user-456',
        content: 'Brand constraint: blue',
        tags: [],
        type: MemoryType.BRAND,
        importance: 8,
        source: 'user',
        confidence: 1.0,
        lastAccessed: '',
        accessCount: 0,
        createdAt: '',
        updatedAt: '',
        metadata: {}
      }
    ];

    const res = await extractor.extract(context, 'Our brand color is blue.');
    assert.strictEqual(res.length, 1);
    
    // Exact duplicate resolved to IGNORE
    assert.strictEqual(res[0].decision, MemoryDecision.IGNORE);
    // Verified no save called
    assert.strictEqual(mockMemoryService.storedRecords.length, 0);
  });

  await t.test('4. Event Broadcasting - logs lifecycle triggers sequentially', async () => {
    extractionFeatureFlags.MEMORY_EXTRACTION = true;
    extractionFeatureFlags.MEMORY_POLICIES = false;

    const extractor = new MemoryExtractor(mockMemoryService);
    const context = { userId: 'user-456' };

    const events: ExtractionLifecycleEvent[] = [];
    extractor.addListener((evt) => {
      events.push(evt);
    });

    await extractor.extract(context, 'I prefer programming.');

    assert.strictEqual(events.length, 4);
    assert.strictEqual(events[0].type, 'EXTRACTION_STARTED');
    assert.strictEqual(events[1].type, 'CANDIDATE_CREATED');
    assert.strictEqual(events[2].type, 'MEMORY_ACCEPTED');
    assert.strictEqual(events[3].type, 'EXTRACTION_COMPLETED');
  });

});
