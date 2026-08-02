import { 
  Experiment, 
  ExperimentVariant, 
  ExperimentAssignment, 
  VariantPerformance, 
  ExperimentAnalytics,
  EvaluationSuiteResult
} from './types';

export class DefaultExperimentService {
  private experiments: Map<string, Experiment> = new Map();
  private assignmentsInMemory: Map<string, ExperimentAssignment> = new Map();
  private key = 'creator-os-ai-exp-assignments';

  private loadAssignments(): ExperimentAssignment[] {
    if (typeof window === 'undefined') return Array.from(this.assignmentsInMemory.values());
    try {
      const data = localStorage.getItem(this.key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveAssignments(list: ExperimentAssignment[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.key, JSON.stringify(list));
    } catch (e) {
      console.error("[AI-EXPERIMENT] Failed to save assignments:", e);
    }
  }

  public registerExperiment(experiment: Experiment): void {
    this.experiments.set(experiment.experimentId, experiment);
  }

  public getExperiment(experimentId: string): Experiment | null {
    return this.experiments.get(experimentId) || null;
  }

  public getAllExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }

  public async assignVariant(experimentId: string, traceId: string): Promise<ExperimentAssignment> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not registered.`);
    }

    if (experiment.variants.length === 0) {
      throw new Error(`Experiment ${experimentId} has no variants.`);
    }

    let selectedVariant: ExperimentVariant;

    if (experiment.selectionStrategy === 'fixed') {
      const activeId = experiment.activeVariantId || experiment.variants[0].variantId;
      selectedVariant = experiment.variants.find(v => v.variantId === activeId) || experiment.variants[0];
    } else if (experiment.selectionStrategy === 'random') {
      const idx = Math.floor(Math.random() * experiment.variants.length);
      selectedVariant = experiment.variants[idx];
    } else { // weighted selection
      const totalWeight = experiment.variants.reduce((sum, v) => sum + (v.weight !== undefined ? v.weight : 1.0), 0);
      let threshold = Math.random() * totalWeight;
      selectedVariant = experiment.variants[0];
      for (const variant of experiment.variants) {
        threshold -= (variant.weight !== undefined ? variant.weight : 1.0);
        if (threshold <= 0) {
          selectedVariant = variant;
          break;
        }
      }
    }

    const assignment: ExperimentAssignment = {
      experimentId,
      variantId: selectedVariant.variantId,
      strategy: experiment.selectionStrategy,
      traceId,
      timestamp: new Date().toISOString()
    };

    // Save assignment
    this.assignmentsInMemory.set(traceId, assignment);
    if (typeof window !== 'undefined') {
      const list = this.loadAssignments();
      list.push(assignment);
      this.saveAssignments(list);
    }

    return assignment;
  }

  public async getAssignment(traceId: string): Promise<ExperimentAssignment | null> {
    if (this.assignmentsInMemory.has(traceId)) {
      return this.assignmentsInMemory.get(traceId) || null;
    }
    if (typeof window !== 'undefined') {
      const list = this.loadAssignments();
      return list.find(a => a.traceId === traceId) || null;
    }
    return null;
  }

  public async getAllAssignments(): Promise<ExperimentAssignment[]> {
    if (typeof window !== 'undefined') {
      return this.loadAssignments();
    }
    return Array.from(this.assignmentsInMemory.values());
  }

  public clear(): void {
    this.assignmentsInMemory.clear();
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.key);
    }
  }
}

export const experimentService = new DefaultExperimentService();

export class DefaultExperimentAnalyticsService {
  private suitesInMemory: Map<string, EvaluationSuiteResult> = new Map();
  private suitesKey = 'creator-os-ai-eval-suites';

  public async saveSuiteResult(suite: EvaluationSuiteResult): Promise<void> {
    this.suitesInMemory.set(suite.suiteId, suite);
    if (typeof window !== 'undefined') {
      try {
        const list = this.loadSuiteResults();
        list.push(suite);
        localStorage.setItem(this.suitesKey, JSON.stringify(list));
      } catch (e) {
        console.error("[AI-ANALYTICS] Failed to save suite result:", e);
      }
    }
  }

  public loadSuiteResults(): EvaluationSuiteResult[] {
    if (typeof window === 'undefined') return Array.from(this.suitesInMemory.values());
    try {
      const data = localStorage.getItem(this.suitesKey);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public async getExperimentAnalytics(experimentId: string): Promise<ExperimentAnalytics> {
    const experiment = experimentService.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not registered.`);
    }

    const assignments = await experimentService.getAllAssignments();
    const expAssignments = assignments.filter(a => a.experimentId === experimentId);
    const suiteResults = this.loadSuiteResults();

    // Map traceId -> assignment
    const assignmentMap = new Map<string, ExperimentAssignment>();
    for (const a of expAssignments) {
      assignmentMap.set(a.traceId, a);
    }

    // Filter suite results belonging to this experiment
    const expSuiteResults = suiteResults.filter(s => assignmentMap.has(s.traceId));

    // Initialize variant performance tracking
    const variantPerformanceMap = new Map<string, {
      variantId: string;
      variantName: string;
      assignmentCount: number;
      relevanceSum: number;
      relevanceCount: number;
      contextUsageSum: number;
      contextUsageCount: number;
      groundingSum: number;
      groundingCount: number;
      responseQualitySum: number;
      responseQualityCount: number;
      overallSum: number;
      overallCount: number;
    }>();

    for (const variant of experiment.variants) {
      variantPerformanceMap.set(variant.variantId, {
        variantId: variant.variantId,
        variantName: variant.name,
        assignmentCount: 0,
        relevanceSum: 0,
        relevanceCount: 0,
        contextUsageSum: 0,
        contextUsageCount: 0,
        groundingSum: 0,
        groundingCount: 0,
        responseQualitySum: 0,
        responseQualityCount: 0,
        overallSum: 0,
        overallCount: 0
      });
    }

    // Count assignments per variant
    for (const a of expAssignments) {
      const perf = variantPerformanceMap.get(a.variantId);
      if (perf) {
        perf.assignmentCount++;
      }
    }

    // Aggregate score values
    for (const suite of expSuiteResults) {
      const assignment = assignmentMap.get(suite.traceId);
      if (!assignment) continue;

      const perf = variantPerformanceMap.get(assignment.variantId);
      if (perf) {
        perf.overallSum += suite.overallScore;
        perf.overallCount++;

        const relevance = suite.results.relevance;
        if (relevance) {
          perf.relevanceSum += relevance.score;
          perf.relevanceCount++;
        }

        const contextUsage = suite.results.contextUsage;
        if (contextUsage) {
          perf.contextUsageSum += contextUsage.score;
          perf.contextUsageCount++;
        }

        const grounding = suite.results.grounding;
        if (grounding) {
          perf.groundingSum += grounding.score;
          perf.groundingCount++;
        }

        const responseQuality = suite.results.responseQuality;
        if (responseQuality) {
          perf.responseQualitySum += responseQuality.score;
          perf.responseQualityCount++;
        }
      }
    }

    const variants: VariantPerformance[] = [];
    let leaderVariantId: string | undefined = undefined;
    let highestScore = -1;

    for (const perf of variantPerformanceMap.values()) {
      const avgOverallScore = perf.overallCount > 0 ? Math.round(perf.overallSum / perf.overallCount) : 0;
      
      variants.push({
        variantId: perf.variantId,
        variantName: perf.variantName,
        assignmentCount: perf.assignmentCount,
        avgRelevance: perf.relevanceCount > 0 ? Math.round(perf.relevanceSum / perf.relevanceCount) : 0,
        avgContextUsage: perf.contextUsageCount > 0 ? Math.round(perf.contextUsageSum / perf.contextUsageCount) : 0,
        avgGrounding: perf.groundingCount > 0 ? Math.round(perf.groundingSum / perf.groundingCount) : 0,
        avgResponseQuality: perf.responseQualityCount > 0 ? Math.round(perf.responseQualitySum / perf.responseQualityCount) : 0,
        avgOverallScore
      });

      if (perf.overallCount > 0 && avgOverallScore > highestScore) {
        highestScore = avgOverallScore;
        leaderVariantId = perf.variantId;
      }
    }

    return {
      experimentId,
      experimentName: experiment.name,
      totalAssignments: expAssignments.length,
      variants,
      leaderVariantId
    };
  }

  public async getAllExperimentAnalytics(): Promise<ExperimentAnalytics[]> {
    const experiments = experimentService.getAllExperiments();
    const list: ExperimentAnalytics[] = [];
    for (const exp of experiments) {
      const analytics = await this.getExperimentAnalytics(exp.experimentId);
      list.push(analytics);
    }
    return list;
  }

  public clear(): void {
    this.suitesInMemory.clear();
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.suitesKey);
    }
  }
}

export const experimentAnalyticsService = new DefaultExperimentAnalyticsService();
