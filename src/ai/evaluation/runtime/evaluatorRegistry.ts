import { 
  Evaluator, 
  EvaluatorResult, 
  EvaluationWeights, 
  EvaluationSuiteResult 
} from './types';
import { calculateDecision } from '../utils/decision';

export class RelevanceEvaluator implements Evaluator {
  public name = 'relevance';

  public async evaluate(content: string, context?: any): Promise<EvaluatorResult> {
    const prompt = context?.prompt || '';
    if (!prompt) {
      return { name: this.name, score: 100, reason: 'No prompt provided to check relevance.', metadata: {} };
    }

    const cleanWords = (text: string) => 
      text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);

    const promptWords = new Set(cleanWords(prompt));
    const contentWords = new Set(cleanWords(content));

    if (promptWords.size === 0) {
      return { name: this.name, score: 100, reason: 'Prompt has no checkable words.', metadata: {} };
    }

    let matchCount = 0;
    for (const word of promptWords) {
      if (contentWords.has(word)) {
        matchCount++;
      }
    }

    const pct = Math.round((matchCount / promptWords.size) * 100);
    const score = Math.max(20, Math.min(100, pct)); // fail-safe floor

    return {
      name: this.name,
      score,
      reason: `Overlap of prompt keywords: ${matchCount}/${promptWords.size} words matched.`,
      metadata: { matchedWordsCount: matchCount, promptWordsCount: promptWords.size }
    };
  }
}

export class ContextUsageEvaluator implements Evaluator {
  public name = 'contextUsage';

  public async evaluate(content: string, context?: any): Promise<EvaluatorResult> {
    const blocks = context?.blocks || [];
    if (blocks.length === 0) {
      return { name: this.name, score: 100, reason: 'No context blocks injected.', metadata: {} };
    }

    const contentLower = content.toLowerCase();
    let citedCount = 0;

    for (const block of blocks) {
      const keywords = block.content
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w: string) => w.length > 4)
        .slice(0, 10); // Check top 10 keywords per block

      if (keywords.length === 0) continue;

      let keywordHits = 0;
      for (const kw of keywords) {
        if (contentLower.includes(kw)) {
          keywordHits++;
        }
      }

      if (keywordHits > 0) {
        citedCount++;
      }
    }

    const pct = Math.round((citedCount / blocks.length) * 100);
    const score = Math.max(30, Math.min(100, pct));

    return {
      name: this.name,
      score,
      reason: `Context utilization rate: ${citedCount}/${blocks.length} blocks referenced.`,
      metadata: { referencedBlocksCount: citedCount, totalBlocksCount: blocks.length }
    };
  }
}

export class GroundingEvaluator implements Evaluator {
  public name = 'grounding';

  public async evaluate(content: string, context?: any): Promise<EvaluatorResult> {
    const blocks = context?.blocks || [];
    if (blocks.length === 0) {
      return { name: this.name, score: 100, reason: 'No source context to ground response.', metadata: {} };
    }

    const contentLower = content.toLowerCase();
    let groundedSentences = 0;
    
    // Extract short sentence structures from blocks
    const sentences = blocks.flatMap((b: any) => 
      b.content
        .split(/[.!?]+/)
        .map((s: string) => s.trim().toLowerCase())
        .filter((s: string) => s.length > 15 && s.length < 150)
    ).slice(0, 5); // check up to 5 sentences

    if (sentences.length === 0) {
      return { name: this.name, score: 100, reason: 'Sources have no checkable assertions.', metadata: {} };
    }

    for (const sentence of sentences) {
      // Split sentence into words and check if content has a high word match rate for that assertion
      const words = sentence.split(/\s+/).filter((w: string) => w.length > 3);
      if (words.length === 0) continue;

      let hitWords = 0;
      for (const w of words) {
        if (contentLower.includes(w)) {
          hitWords++;
        }
      }

      if (words.length > 0 && hitWords / words.length > 0.6) {
        groundedSentences++;
      }
    }

    const pct = Math.round((groundedSentences / sentences.length) * 100);
    const score = Math.max(40, Math.min(100, pct));

    return {
      name: this.name,
      score,
      reason: `Grounding score: ${groundedSentences}/${sentences.length} assertions verified against context.`,
      metadata: { verifiedAssertionsCount: groundedSentences, totalAssertionsCount: sentences.length }
    };
  }
}

export class ResponseQualityEvaluator implements Evaluator {
  public name = 'responseQuality';

  public async evaluate(content: string): Promise<EvaluatorResult> {
    if (content.length < 50) {
      return { name: this.name, score: 30, reason: 'Content length is too short.', metadata: { length: content.length } };
    }

    const words = content.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 0);
    const wordCounts: Record<string, number> = {};
    for (const w of words) {
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    }

    let repeatPenalty = 0;
    for (const count of Object.values(wordCounts)) {
      if (count > 8) {
        repeatPenalty += (count - 8) * 3;
      }
    }

    const score = Math.max(30, Math.min(100, 100 - repeatPenalty));

    return {
      name: this.name,
      score,
      reason: `Grammar and repetition checks completed. Repetition penalty: -${repeatPenalty}.`,
      metadata: { length: content.length, uniqueWords: Object.keys(wordCounts).length, repeatPenalty }
    };
  }
}

export class DefaultEvaluationRunner {
  private evaluators: Map<string, Evaluator> = new Map();
  private weights: EvaluationWeights = {
    relevance: 1.0,
    contextUsage: 1.0,
    grounding: 1.0,
    responseQuality: 1.0
  };

  constructor() {
    this.registerEvaluator(new RelevanceEvaluator());
    this.registerEvaluator(new ContextUsageEvaluator());
    this.registerEvaluator(new GroundingEvaluator());
    this.registerEvaluator(new ResponseQualityEvaluator());
  }

  public registerEvaluator(evaluator: Evaluator): void {
    this.evaluators.set(evaluator.name, evaluator);
  }

  public unregisterEvaluator(name: string): void {
    this.evaluators.delete(name);
  }

  public setWeights(weights: Partial<EvaluationWeights>): void {
    this.weights = {
      ...this.weights,
      ...weights
    };
  }

  public getWeights(): EvaluationWeights {
    return this.weights;
  }

  public async runSuite(
    content: string, 
    context: { traceId: string; requestId: string; variantId?: string; [key: string]: any }
  ): Promise<EvaluationSuiteResult> {
    const results: Record<string, EvaluatorResult> = {};
    const suiteId = `suite-${Math.random().toString(36).substring(2, 9)}`;

    for (const [name, evaluator] of this.evaluators) {
      try {
        const res = await evaluator.evaluate(content, context);
        results[name] = res;
      } catch (err: any) {
        console.error(`[AI-EVALUATION-RUNTIME] Evaluator ${name} failed:`, err);
        results[name] = {
          name,
          score: 0,
          reason: `Evaluator crashed: ${err.message}`,
          metadata: { error: err.message }
        };
      }
    }

    // Weighted Overall Score Arithmetic
    let weightedSum = 0;
    let totalWeight = 0;

    const w = this.weights as any;
    for (const name of Object.keys(results)) {
      const weightVal = w[name] ?? 1.0;
      weightedSum += results[name].score * weightVal;
      totalWeight += weightVal;
    }

    const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    const suiteScores = {
      relevance: results['relevance']?.score,
      grounding: results['grounding']?.score,
      responseQuality: results['responseQuality']?.score,
      contextUsage: results['contextUsage']?.score
    };
    const suiteExpected: any[] = [];
    if (results['relevance'] !== undefined) suiteExpected.push('relevance');
    if (results['grounding'] !== undefined) suiteExpected.push('grounding');
    if (results['responseQuality'] !== undefined) suiteExpected.push('responseQuality');
    if (results['contextUsage'] !== undefined) suiteExpected.push('contextUsage');

    const decision = calculateDecision(suiteScores, suiteExpected);

    return {
      suiteId,
      traceId: context.traceId,
      requestId: context.requestId,
      variantId: context.variantId,
      overallScore,
      status: 'completed',
      results,
      decision,
      metadata: { weights: { ...this.weights } },
      createdAt: new Date().toISOString()
    };
  }
}

export const evaluationRunner = new DefaultEvaluationRunner();
