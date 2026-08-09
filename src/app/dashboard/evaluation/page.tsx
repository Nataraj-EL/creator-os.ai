'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../../lib/store';
import { 
  evaluationService 
} from '../../../ai/evaluation/services';
import { traceRuntime } from '../../../ai/observability';
import { 
  experimentService,
  experimentAnalyticsService
} from '../../../ai/evaluation/runtime';
import { 
  featureFlags as streamFeatureFlags 
} from '../../../ai/streaming';
import { streamRuntime } from '../../../lib/generationService';
import { 
  featureFlags as toolFeatureFlags 
} from '../../../ai/tools';
import { toolRegistry, toolRuntime } from '../../../lib/generationService';
import { 
  EvaluationRepositoryFactory 
} from '../../../ai/evaluation/storage/repositoryFactory';
import { 
  EvaluationResult, 
  EvaluationStage, 
  EvaluationStatus, 
  EvaluationMetric 
} from '../../../ai/evaluation/types';
import { 
  FolderGit2, 
  Search, 
  Play, 
  Download, 
  Filter, 
  Clock, 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  FileJson, 
  Layers, 
  Info, 
  ChevronRight, 
  X,
  RefreshCcw,
  Sparkles,
  Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Seed initial mockup data if storage is empty, to provide instant inspector utility
const SEED_RECORDS: EvaluationResult[] = [
  {
    evaluationId: 'eval-llm-1a2b3c4',
    context: {
      requestId: 'req-prod-098a',
      creatorId: 'creator-999',
      stage: EvaluationStage.GENERATION,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {
        generatedContent: 'Here is a high-performing script hook about finance...',
        inputPrompt: 'Write a finance script hook.',
        brandVoice: 'Educational, Professional',
        judgeModel: 'gemini-1.5-pro',
        judgePromptVersion: '1.0.0',
        evaluationVersion: 'v1'
      }
    },
    status: EvaluationStatus.COMPLETED,
    metrics: [
      { metricId: 'relevance', name: 'Reel/Content Relevance', score: 90, weight: 0.15, confidence: 0.95, status: 'pass', reason: 'Directly addresses requested topic parameters.' },
      { metricId: 'faithfulness', name: 'Audit Faithfulness', score: 80, weight: 0.15, confidence: 0.90, status: 'pass', reason: 'Factual representation and coherent logic.' },
      { metricId: 'creatorVoice', name: 'Creator Voice Alignment', score: 90, weight: 0.20, confidence: 0.95, status: 'pass', reason: 'Captures the educational, authoritative brand tone.' },
      { metricId: 'platformSuitability', name: 'Platform Suitability', score: 90, weight: 0.15, confidence: 0.90, status: 'pass', reason: 'Excellent reel length constraints matched.' },
      { metricId: 'engagement', name: 'Engagement Intros & Pacing', score: 80, weight: 0.15, confidence: 0.85, status: 'pass', reason: 'Hook is effective and commands attention.' },
      { metricId: 'readability', name: 'Script Readability', score: 90, weight: 0.10, confidence: 0.95, status: 'pass', reason: 'Clean vocabulary choices.' },
      { metricId: 'actionability', name: 'Call-to-Action Strength', score: 80, weight: 0.10, confidence: 0.90, status: 'pass', reason: 'Clear subscription CTA included.' }
    ],
    overallScore: 86,
    latencyMs: 1420,
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString()
  },
  {
    evaluationId: 'eval-failed-f5g6h7',
    context: {
      requestId: 'req-prod-041x',
      creatorId: 'creator-999',
      stage: EvaluationStage.GENERATION,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {
        generatedContent: 'Raw text snippet for audit.',
        inputPrompt: 'Short prompt.',
        judgeModel: 'gemini-1.5-pro',
        judgePromptVersion: '1.0.0',
        evaluationVersion: 'v1'
      }
    },
    status: EvaluationStatus.FAILED,
    metrics: [],
    overallScore: 0,
    latencyMs: 840,
    errorMessage: '[Provider: LLM-Judge] Upstream provider call failed with status 503: Service Unavailable',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString()
  },
  {
    evaluationId: 'eval-skip-9x8y7z',
    context: {
      requestId: 'req-prod-025m',
      creatorId: 'creator-999',
      stage: EvaluationStage.MEMORY,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {}
    },
    status: EvaluationStatus.SKIPPED,
    metrics: [],
    overallScore: 0,
    latencyMs: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString()
  }
];

export default function DeveloperEvaluationConsole() {
  const user = useAuthStore((state) => state.user);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  
  // Storage Repository
  const repository = EvaluationRepositoryFactory.getRepository();

  // Page States
  const [records, setRecords] = useState<EvaluationResult[]>([]);
  const [evaluationSourceTab, setEvaluationSourceTab] = useState<'runtime' | 'promptfoo'>('runtime');
  const [selectedRecord, setSelectedRecord] = useState<EvaluationResult | null>(null);
  const [inspectTab, setInspectTab] = useState<'parsed' | 'raw' | 'trace'>('parsed');
  const [activeTrace, setActiveTrace] = useState<any | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [consoleTab, setConsoleTab] = useState<'runs' | 'experiments' | 'streaming' | 'tools'>('runs');
  const [experimentsAnalytics, setExperimentsAnalytics] = useState<any[]>([]);

  // Tools Console Sandbox States
  const [registeredTools, setRegisteredTools] = useState<any[]>([]);
  const [selectedTool, setSelectedTool] = useState<any | null>(null);
  const [toolArgumentsInput, setToolArgumentsInput] = useState('{\n  "location": "New York",\n  "units": "celsius"\n}');
  const [toolExecutionHistory, setToolExecutionHistory] = useState<any[]>([]);
  const [selectedToolExecution, setSelectedToolExecution] = useState<any | null>(null);
  const [executingTool, setExecutingTool] = useState(false);
  const [toolSandboxResult, setToolSandboxResult] = useState<any | null>(null);

  useEffect(() => {
    setRegisteredTools(toolRegistry.listTools());
    if (toolRegistry.listTools().length > 0 && !selectedTool) {
      setSelectedTool(toolRegistry.listTools()[0]);
    }
  }, [consoleTab]);

  useEffect(() => {
    if (selectedTool) {
      if (selectedTool.name === 'fetch_weather') {
        setToolArgumentsInput(JSON.stringify({ location: 'New York', units: 'celsius' }, null, 2));
      } else if (selectedTool.name === 'generate_image_mock') {
        setToolArgumentsInput(JSON.stringify({ promptText: 'Vibrant neon skyline', aspectRatio: '16:9' }, null, 2));
      } else {
        const defaultArgs: Record<string, any> = {};
        const props = selectedTool.schema?.parameters?.properties || {};
        Object.keys(props).forEach(k => {
          if (props[k].enum && props[k].enum.length > 0) {
            defaultArgs[k] = props[k].enum[0];
          } else {
            defaultArgs[k] = props[k].type === 'string' ? 'test' : props[k].type === 'number' ? 123 : true;
          }
        });
        setToolArgumentsInput(JSON.stringify(defaultArgs, null, 2));
      }
    }
  }, [selectedTool]);

  // Pre-seed registry if empty for visual sandbox utility
  useEffect(() => {
    if (toolRegistry.listTools().length === 0) {
      toolRegistry.register({
        name: 'fetch_weather',
        description: 'Retrieves current weather details for a specific geo-location.',
        category: 'Information',
        schema: {
          name: 'fetch_weather',
          description: 'Retrieves current weather details for a specific geo-location.',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name or coordinates.' },
              units: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature scale format.' }
            },
            required: ['location']
          }
        },
        execute: async (args) => {
          return {
            temperature: args.units === 'fahrenheit' ? 72 : 22,
            conditions: 'Mostly Sunny',
            humidity: '45%'
          };
        }
      });
      toolRegistry.register({
        name: 'generate_image_mock',
        description: 'Generates a mock media visual from description guidelines.',
        category: 'Media',
        schema: {
          name: 'generate_image_mock',
          description: 'Generates a mock media visual from description guidelines.',
          parameters: {
            type: 'object',
            properties: {
              promptText: { type: 'string', description: 'Text prompt descriptions.' },
              aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1'] }
            },
            required: ['promptText']
          }
        },
        execute: async (args) => {
          return {
            url: `https://images.unsplash.com/photo-mock-${args.aspectRatio.replace(':', '-')}`,
            seed: 874920
          };
        }
      });
      const list = toolRegistry.listTools();
      setRegisteredTools(list);
      if (list.length > 0) {
        setSelectedTool(list[0]);
      }
    }
  }, []);

  const runToolSandbox = async () => {
    if (!selectedTool) return;
    setExecutingTool(true);
    setToolSandboxResult(null);

    let parsedArgs = {};
    try {
      parsedArgs = JSON.parse(toolArgumentsInput);
    } catch (err: any) {
      setExecutingTool(false);
      const invalidResult = {
        toolName: selectedTool.name,
        executionId: 'exec-' + Math.random().toString(36).substring(2, 9),
        success: false,
        status: 'FAILED' as const,
        error: `Invalid JSON Arguments: ${err.message}`,
        latencyMs: 0,
        retryCount: 0
      };
      setToolSandboxResult(invalidResult);
      return;
    }

    const startTime = Date.now();
    const traceId = 'trace-mw-' + Math.random().toString(36).substring(2, 9);
    const requestId = 'req-mw-' + Math.random().toString(36).substring(2, 9);

    try {
      const result = await toolRuntime.execute({
        toolName: selectedTool.name,
        arguments: parsedArgs,
        context: {
          requestId,
          traceId,
          creatorId: 'creator-999',
          workspaceId: 'workspace-123'
        }
      });

      setToolSandboxResult(result);
      
      const newExecution = {
        executionId: result.executionId,
        toolName: selectedTool.name,
        arguments: parsedArgs,
        success: result.success,
        status: result.status,
        output: result.output,
        error: result.error,
        latencyMs: result.latencyMs,
        retryCount: result.retryCount,
        timestamp: new Date().toISOString()
      };

      setToolExecutionHistory(prev => [newExecution, ...prev]);
      setSelectedToolExecution(newExecution);
    } catch (err: any) {
      const failedExec = {
        executionId: 'exec-' + Math.random().toString(36).substring(2, 9),
        toolName: selectedTool.name,
        arguments: parsedArgs,
        success: false,
        status: 'FAILED' as const,
        error: err.message || 'Execution error',
        latencyMs: Date.now() - startTime,
        retryCount: 0,
        timestamp: new Date().toISOString()
      };
      setToolSandboxResult(failedExec);
      setToolExecutionHistory(prev => [failedExec, ...prev]);
      setSelectedToolExecution(failedExec);
    } finally {
      setExecutingTool(false);
    }
  };

  // Streaming Sandbox States
  const [streamPrompt, setStreamPrompt] = useState('Write a 3-step script hook for a tech review video.');
  const [streamProvider, setStreamProvider] = useState('mock');
  const [streamModel, setStreamModel] = useState('mock-model');
  const [streamOutput, setStreamOutput] = useState('');
  const [streamStatus, setStreamStatus] = useState<'idle' | 'active' | 'paused' | 'cancelled' | 'completed' | 'error'>('idle');
  const [streamTokens, setStreamTokens] = useState(0);
  const [streamLatency, setStreamLatency] = useState(0);
  const [streamSession, setStreamSession] = useState<any>(null);
  const [streamMetadata, setStreamMetadata] = useState<any>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const startStreaming = async () => {
    setStreamOutput('');
    setStreamTokens(0);
    setStreamLatency(0);
    setStreamMetadata(null);
    setStreamError(null);
    setStreamStatus('active');

    try {
      const session = streamRuntime.createSession({
        prompt: streamPrompt,
        model: streamModel,
        provider: streamProvider
      }, {
        traceId: 'trace-mw-' + Math.random().toString(36).substring(2, 9),
        requestId: 'req-mw-' + Math.random().toString(36).substring(2, 9)
      });

      setStreamSession(session);

      session.subscribe({
        onEvent: (event: any) => {
          if (event.type === 'token') {
            setStreamOutput(prev => prev + event.content);
            setStreamTokens(session.tokenCount);
            setStreamLatency(Date.now() - session.startTime);
          } else if (event.type === 'metadata') {
            if (event.metadata?.streamId) {
              setStreamMetadata(event.metadata);
            }
          } else if (event.type === 'completion') {
            setStreamStatus('completed');
          } else if (event.type === 'error') {
            setStreamStatus('error');
            setStreamError(event.content || 'Streaming error');
          }
        }
      });

      session.start();
    } catch (err: any) {
      setStreamStatus('error');
      setStreamError(err.message || 'Failed to start session');
    }
  };

  const cancelStreaming = () => {
    if (streamSession) {
      streamSession.cancel();
      setStreamStatus('cancelled');
    }
  };

  const pauseStreaming = () => {
    if (streamSession) {
      streamSession.pause();
      setStreamStatus('paused');
    }
  };

  const resumeStreaming = () => {
    if (streamSession) {
      streamSession.resume();
      setStreamStatus('active');
    }
  };
  
  // Interactive Filters
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Execution Triggers State
  const [runningEval, setRunningEval] = useState(false);
  const [simulatedLogs, setSimulatedLogs] = useState<string[]>([]);

  // Load records
  const loadRecords = async () => {
    try {
      const token = useAuthStore.getState().accessToken;
      const ws = useAuthStore.getState().activeWorkspace;
      
      let data: EvaluationResult[] = [];
      if (token && ws) {
        try {
          const response = await fetch(`/api/evaluation?workspaceId=${ws.id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (response.ok) {
            data = await response.json();
          }
        } catch (apiErr) {
          console.warn("Failed to fetch evaluations from API, falling back to local storage:", apiErr);
        }
      }

      // If API fetch returns nothing or fails, fallback to local storage/mock seeded records
      if (!data || data.length === 0) {
        data = await (repository as any).getAll();
        if (!data || data.length === 0) {
          for (const item of SEED_RECORDS) {
            await repository.save(item);
          }
          data = await (repository as any).getAll();
        }
      }

      // Sort newest first
      const sorted = [...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRecords(sorted);
      await loadExperiments();
    } catch (e) {
      console.error(e);
    }
  };

  const loadExperiments = async () => {
    try {
      const list = await experimentAnalyticsService.getAllExperimentAnalytics();
      setExperimentsAnalytics(list);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [activeWorkspace]);

  useEffect(() => {
    if (!selectedRecord) {
      setActiveTrace(null);
      setSelectedEvent(null);
      return;
    }

    const fetchTrace = async () => {
      const sessionId = selectedRecord.context?.sessionId;
      let trace = null;
      if (sessionId) {
        trace = await traceRuntime.getTrace(sessionId);
      }
      
      if (trace) {
        setActiveTrace(trace);
      } else {
        // Fallback realistic mock trace for seed/mock data
        const traceId = sessionId || `trace-seed-${Math.random().toString(36).substring(2, 9)}`;
        const duration = selectedRecord.latencyMs || 1000;
        const start = new Date(selectedRecord.createdAt).getTime();
        
        const generatedMockTrace = {
          traceId,
          requestId: selectedRecord.context?.requestId || 'N/A',
          startTime: selectedRecord.createdAt,
          endTime: new Date(start + duration).toISOString(),
          durationMs: duration,
          status: selectedRecord.status === EvaluationStatus.FAILED ? 'failed' : 'completed',
          events: [
            {
              eventId: 'evt-mw-1',
              traceId,
              requestId: selectedRecord.context?.requestId || 'N/A',
              timestamp: new Date(start).toISOString(),
              stage: 'middleware',
              component: 'TraceMiddleware',
              status: 'started',
              metadata: { model: selectedRecord.context?.model || 'Unknown', provider: selectedRecord.context?.provider || 'Unknown' }
            },
            {
              eventId: 'evt-ctx-1',
              traceId,
              requestId: selectedRecord.context?.requestId || 'N/A',
              timestamp: new Date(start + Math.round(duration * 0.05)).toISOString(),
              stage: 'context',
              component: 'ContextAssemblyRuntime',
              status: 'started',
              metadata: { strategy: 'BALANCED', tokenBudget: 2000 }
            },
            {
              eventId: 'evt-ret-1',
              traceId,
              requestId: selectedRecord.context?.requestId || 'N/A',
              timestamp: new Date(start + Math.round(duration * 0.08)).toISOString(),
              stage: 'retrieval',
              component: 'RetrievalService',
              status: 'started',
              metadata: { topK: 10 }
            },
            {
              eventId: 'evt-ret-2',
              traceId,
              requestId: selectedRecord.context?.requestId || 'N/A',
              timestamp: new Date(start + Math.round(duration * 0.18)).toISOString(),
              stage: 'retrieval',
              component: 'RetrievalService',
              status: 'completed',
              latencyMs: Math.round(duration * 0.1),
              metadata: { mode: 'semantic', resultsCount: 2 }
            },
            {
              eventId: 'evt-ctx-2',
              traceId,
              requestId: selectedRecord.context?.requestId || 'N/A',
              timestamp: new Date(start + Math.round(duration * 0.22)).toISOString(),
              stage: 'context',
              component: 'ContextAssemblyRuntime',
              status: 'completed',
              latencyMs: Math.round(duration * 0.17),
              metadata: { blocksCount: 2, totalTokens: 450 }
            },
            {
              eventId: 'evt-pb-1',
              traceId,
              requestId: selectedRecord.context?.requestId || 'N/A',
              timestamp: new Date(start + Math.round(duration * 0.25)).toISOString(),
              stage: 'prompt-builder',
              component: 'PromptBuilder',
              status: 'completed',
              metadata: { promptVersion: '1.0.0', strategy: 'BALANCED' }
            },
            {
              eventId: 'evt-eval-1',
              traceId,
              requestId: selectedRecord.context?.requestId || 'N/A',
              timestamp: new Date(start + Math.round(duration * 0.28)).toISOString(),
              stage: 'evaluation',
              component: 'EvaluationService',
              status: 'started',
              metadata: { stage: selectedRecord.context?.stage || 'N/A' }
            },
            {
              eventId: 'evt-eval-2',
              traceId,
              requestId: selectedRecord.context?.requestId || 'N/A',
              timestamp: new Date(start + Math.round(duration * 0.95)).toISOString(),
              stage: 'evaluation',
              component: 'EvaluationService',
              status: selectedRecord.status === EvaluationStatus.FAILED ? 'failed' : 'completed',
              latencyMs: Math.round(duration * 0.67),
              metadata: { status: selectedRecord.status, overallScore: selectedRecord.overallScore }
            },
            {
              eventId: 'evt-mw-2',
              traceId,
              requestId: selectedRecord.context?.requestId || 'N/A',
              timestamp: new Date(start + duration).toISOString(),
              stage: 'middleware',
              component: 'TraceMiddleware',
              status: selectedRecord.status === EvaluationStatus.FAILED ? 'failed' : 'completed',
              latencyMs: duration,
              metadata: {}
            }
          ]
        };
        setActiveTrace(generatedMockTrace);
      }
      setSelectedEvent(null);
    };

    fetchTrace();
  }, [selectedRecord]);

  // Filter records
  const filteredRecords = records.filter(r => {
    const isPF = r.evaluationId.startsWith('eval-pf-');
    const matchesSource = evaluationSourceTab === 'promptfoo' ? isPF : !isPF;
    if (!matchesSource) return false;

    const matchesSearch = 
      r.evaluationId.toLowerCase().includes(search.toLowerCase()) ||
      (r.context?.requestId || 'N/A').toLowerCase().includes(search.toLowerCase()) ||
      (r.context?.sessionId && r.context.sessionId.toLowerCase().includes(search.toLowerCase()));

    const matchesStage = filterStage === 'all' || r.context?.stage === filterStage;
    const matchesProvider = filterProvider === 'all' || r.context?.provider === filterProvider;
    const matchesStatus = filterStatus === 'all' || r.status === filterStatus;

    return matchesSearch && matchesStage && matchesProvider && matchesStatus;
  });

  const activeSourceRecords = records.filter(r => {
    const isPF = r.evaluationId.startsWith('eval-pf-');
    return evaluationSourceTab === 'promptfoo' ? isPF : !isPF;
  });

  // Summary Computations
  const totalEvals = activeSourceRecords.length;
  const completedEvals = activeSourceRecords.filter(r => r.status === EvaluationStatus.COMPLETED);
  const failedEvals = activeSourceRecords.filter(r => r.status === EvaluationStatus.FAILED);
  const skippedEvals = activeSourceRecords.filter(r => r.status === EvaluationStatus.SKIPPED);

  const avgScore = completedEvals.length > 0
    ? Math.round(completedEvals.reduce((sum, r) => sum + r.overallScore, 0) / completedEvals.length)
    : 0;

  const avgLatency = completedEvals.length > 0
    ? Math.round(completedEvals.reduce((sum, r) => sum + r.latencyMs, 0) / completedEvals.length)
    : 0;

  const successRate = totalEvals > 0
    ? Math.round(((completedEvals.length + skippedEvals.length) / totalEvals) * 100)
    : 100;

  // PASS/WARN/FAIL distribution
  const passCount = activeSourceRecords.filter(r => r.decision === 'PASS').length;
  const warnCount = activeSourceRecords.filter(r => r.decision === 'WARN').length;
  const failCount = activeSourceRecords.filter(r => r.decision === 'FAIL').length;

  // Usage & Cost
  const totalTokens = activeSourceRecords.reduce((sum, r) => sum + (r.context?.metadata?.tokenUsage?.total || 0), 0);
  const totalCost = activeSourceRecords.reduce((sum, r) => sum + (r.context?.metadata?.estimatedCost || 0.0), 0);

  // Model comparison
  const modelStats = activeSourceRecords.reduce((acc: any, r) => {
    const key = `${r.context?.provider || 'Unknown'} - ${r.context?.model || 'Unknown'}`;
    if (!acc[key]) {
      acc[key] = { key, count: 0, scoreSum: 0, latencySum: 0 };
    }
    acc[key].count++;
    acc[key].scoreSum += r.overallScore;
    acc[key].latencySum += r.latencyMs;
    return acc;
  }, {});
  const modelComparisonList = Object.values(modelStats).map((s: any) => ({
    model: s.key,
    avgScore: Math.round(s.scoreSum / s.count),
    avgLatency: Math.round(s.latencySum / s.count),
    count: s.count
  }));

  // Run Evaluation Action
  const handleRunEvaluation = async () => {
    setRunningEval(true);
    setSimulatedLogs([]);
    
    // Simulate pipeline tracing logs
    const addLog = (msg: string) => {
      setSimulatedLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    addLog("Initializing evaluation runner context...");
    addLog("Loading feature flags config from registry...");

    const sampleContext = {
      requestId: `req-sim-${Math.random().toString(36).substring(2, 9)}`,
      creatorId: user?.id || 'dev-sandbox-999',
      stage: EvaluationStage.GENERATION,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {
        generatedContent: `Hey creators! Welcome back to the channel. Today we're breaking down how the Gemini API routes fallback providers automatically. If the primary service goes down, Groq acts as a secondary container. This keeps scriptwriting functional even during provider rate limit drops. Like and subscribe for more developer sprints!`,
        inputPrompt: 'Write a short video intro explaining the CreatorOS provider fallbacks.',
        brandVoice: 'High energy, casual, visual'
      }
    };

    try {
      // Force enable generation evaluations in local memory flags temporarily for this sandbox run
      const originalMaster = (window as any)._evalEnabled;
      (window as any)._evalEnabled = true;

      addLog(`Evaluation stage set to: ${sampleContext.stage}`);
      addLog(`Selecting evaluator provider: ${sampleContext.provider} (${sampleContext.model})`);
      addLog("Transmitting content bundle to API endpoint...");
      
      const res = await evaluationService.evaluate(sampleContext);
      
      if (res.status === EvaluationStatus.COMPLETED) {
        addLog("Response payload parsed successfully.");
        addLog("Zod validation checks completed: PASS.");
        addLog(`Metrics stored: overall score: ${res.overallScore}%`);
      } else if (res.status === EvaluationStatus.SKIPPED) {
        addLog("Evaluation skipped: Stage toggle disabled in featureFlags.ts.");
      } else {
        addLog(`Evaluation failed: ${res.errorMessage}`);
      }

      await loadRecords();
    } catch (e: any) {
      addLog(`Execution error: ${e.message}`);
    } finally {
      setRunningEval(false);
    }
  };

  // Export JSON Record
  const handleExportJSON = (record: EvaluationResult) => {
    const dataToExport = inspectTab === 'trace' && activeTrace ? activeTrace : record;
    const filename = inspectTab === 'trace' ? `trace-${activeTrace?.traceId}.json` : `evaluation-${record.evaluationId}.json`;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Clear All Records
  const handleClearRecords = async () => {
    if (confirm("Are you sure you want to clear all local storage evaluation records?")) {
      await (repository as any).clear();
      experimentService.clear();
      experimentAnalyticsService.clear();
      setRecords([]);
      setSelectedRecord(null);
      await loadExperiments();
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Developer Evaluation Console</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider">
              Internal Only
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">Audit run tracing, provider latency comparisons, prompt performance scores, and raw model payloads.</p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={handleClearRecords}
            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-red-950/10 border border-red-500/10 hover:bg-red-950/30 hover:border-red-500/30 text-red-400 font-medium text-xs cursor-pointer transition-all focus:outline-none flex items-center justify-center gap-2"
          >
            Clear Logs
          </button>
          
          <button
            onClick={loadRecords}
            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300 font-medium text-xs cursor-pointer transition-all focus:outline-none flex items-center justify-center gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleRunEvaluation}
            disabled={runningEval}
            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 disabled:from-cyan-950 disabled:to-indigo-950 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/10 transition-all border border-transparent focus:outline-none disabled:cursor-not-allowed"
          >
            {runningEval ? (
              <>
                <RefreshCcw className="h-4.5 w-4.5 animate-spin" />
                <span>Running Audit...</span>
              </>
            ) : (
              <>
                <Play className="h-4.5 w-4.5" />
                <span>Run Evaluation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* SANDBOX RUN LOGS */}
      {simulatedLogs.length > 0 && (
        <div className="bg-black/40 border border-white/5 rounded-2xl p-5 font-mono text-[11px] text-cyan-400 space-y-1.5 shadow-inner">
          <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
              <span>Real-time Sandbox Audit Execution Logs</span>
            </span>
            <button 
              onClick={() => setSimulatedLogs([])}
              className="text-zinc-500 hover:text-zinc-300 focus:outline-none cursor-pointer"
            >
              Close logs
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
            {simulatedLogs.map((log, index) => (
              <div key={index} className="leading-relaxed">{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* SUMMARY METRICS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
          <span className="text-xs text-zinc-400 font-medium">Total Runs</span>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-2xl font-black text-white">{totalEvals}</span>
            <span className="text-[10px] text-zinc-500 font-semibold">audits</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
          <span className="text-xs text-zinc-400 font-medium">Average Score</span>
          <div className="mt-3 flex items-baseline gap-1">
            <span className={`text-2xl font-black ${
              avgScore >= 80 ? 'text-emerald-400' : avgScore >= 60 ? 'text-amber-400' : 'text-zinc-400'
            }`}>{avgScore}%</span>
            <span className="text-[10px] text-zinc-500 font-semibold">LLM grade</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
          <span className="text-xs text-zinc-400 font-medium">Avg Latency</span>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-2xl font-black text-white">{avgLatency}</span>
            <span className="text-[10px] text-zinc-500 font-semibold">ms</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
          <span className="text-xs text-zinc-400 font-medium">Success Rate</span>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-400">{successRate}%</span>
            <span className="text-[10px] text-zinc-500 font-semibold">passed</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/5 col-span-2 lg:col-span-1 flex flex-col justify-between">
          <span className="text-xs text-zinc-400 font-medium">Failed Audits</span>
          <div className="mt-3 flex items-baseline gap-1">
            <span className={`text-2xl font-black ${failedEvals.length > 0 ? 'text-red-400' : 'text-zinc-500'}`}>{failedEvals.length}</span>
            <span className="text-[10px] text-zinc-500 font-semibold">errors</span>
          </div>
        </div>
      </div>

      {/* SUMMARY DETAILS BLOCK */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* PASS/WARN/FAIL Distribution */}
        <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Decision Distribution</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-emerald-500" />
                <span>PASS</span>
              </span>
              <span className="text-white font-bold">{passCount} ({totalEvals ? Math.round(passCount / totalEvals * 100) : 0}%)</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-amber-500" />
                <span>WARN</span>
              </span>
              <span className="text-white font-bold">{warnCount} ({totalEvals ? Math.round(warnCount / totalEvals * 100) : 0}%)</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-red-500" />
                <span>FAIL</span>
              </span>
              <span className="text-white font-bold">{failCount} ({totalEvals ? Math.round(failCount / totalEvals * 100) : 0}%)</span>
            </div>
          </div>
        </div>

        {/* Cost & Token Usage */}
        <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Usage & Cost Summary</h4>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-400">Total Tokens</span>
              <span className="text-white font-mono font-bold">{totalTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Estimated Cost</span>
              <span className="text-cyan-400 font-mono font-bold">${totalCost.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Avg Cost / Run</span>
              <span className="text-white font-mono font-bold">${(totalEvals ? totalCost / totalEvals : 0).toFixed(6)}</span>
            </div>
          </div>
        </div>

        {/* Provider/Model Comparison */}
        <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Model Quality Comparison</h4>
          <div className="max-h-32 overflow-y-auto custom-scrollbar text-[11px] space-y-2">
            {modelComparisonList.map((m: any) => (
              <div key={m.model} className="flex justify-between items-center border-b border-white/5 pb-1">
                <span className="text-zinc-300 font-semibold truncate max-w-[140px]" title={m.model}>{m.model}</span>
                <div className="flex gap-3 text-right">
                  <span className="text-emerald-400 font-bold">{m.avgScore}% avg</span>
                  <span className="text-zinc-500">{m.avgLatency}ms</span>
                </div>
              </div>
            ))}
            {modelComparisonList.length === 0 && (
              <div className="text-zinc-500 text-center py-4 italic">No comparative model stats yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* CONSOLE TAB SWITCHER */}
      <div className="flex border-b border-white/5 mb-6">
        <button
          onClick={() => setConsoleTab('runs')}
          className={`py-3 px-6 text-sm font-bold transition-all border-b-2 cursor-pointer focus:outline-none ${
            consoleTab === 'runs' 
              ? 'border-cyan-500 text-cyan-400 font-extrabold' 
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Evaluation Audit Runs
        </button>
        <button
          onClick={() => setConsoleTab('experiments')}
          className={`py-3 px-6 text-sm font-bold transition-all border-b-2 cursor-pointer focus:outline-none ${
            consoleTab === 'experiments' 
              ? 'border-cyan-500 text-cyan-400 font-extrabold' 
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          A/B Experiments Console
        </button>
        {streamFeatureFlags.STREAM_UI && (
          <button
            onClick={() => setConsoleTab('streaming')}
            className={`py-3 px-6 text-sm font-bold transition-all border-b-2 cursor-pointer focus:outline-none ${
              consoleTab === 'streaming' 
                ? 'border-cyan-500 text-cyan-400 font-extrabold' 
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Streaming Sandbox
          </button>
        )}
        {toolFeatureFlags.TOOLS_ENABLED && (
          <button
            onClick={() => setConsoleTab('tools')}
            className={`py-3 px-6 text-sm font-bold transition-all border-b-2 cursor-pointer focus:outline-none ${
              consoleTab === 'tools' 
                ? 'border-cyan-500 text-cyan-400 font-extrabold' 
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Tools Sandbox
          </button>
        )}
      </div>

      {consoleTab === 'runs' && (
        <>
          {/* FILTER CONTROLS */}
      <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Source Toggle */}
        <div className="flex gap-1 bg-white/[0.02] border border-white/[0.06] p-1 rounded-xl w-full md:w-auto shrink-0">
          <button
            onClick={() => setEvaluationSourceTab('runtime')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none ${
              evaluationSourceTab === 'runtime'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                : 'border border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Production Runtime
          </button>
          <button
            onClick={() => setEvaluationSourceTab('promptfoo')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none ${
              evaluationSourceTab === 'promptfoo'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                : 'border border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Offline Promptfoo
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Request ID, Eval ID..."
            className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Stage */}
          <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.06] rounded-xl px-3 py-1.5">
            <Layers className="h-3.5 w-3.5 text-zinc-500" />
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="bg-transparent text-xs text-zinc-300 font-medium border-none focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Stages</option>
              <option value={EvaluationStage.GENERATION}>Generation</option>
              <option value={EvaluationStage.RETRIEVAL}>Retrieval</option>
              <option value={EvaluationStage.MEMORY}>Memory</option>
              <option value={EvaluationStage.CONTEXT}>Context</option>
              <option value={EvaluationStage.PROMPT}>Prompt</option>
              <option value={EvaluationStage.CONVERSATION}>Conversation</option>
            </select>
          </div>

          {/* Provider */}
          <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.06] rounded-xl px-3 py-1.5">
            <Filter className="h-3.5 w-3.5 text-zinc-500" />
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="bg-transparent text-xs text-zinc-300 font-medium border-none focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Providers</option>
              <option value="LLM-Judge">LLM Judge</option>
              <option value="Promptfoo">Promptfoo</option>
              <option value="RAGAS">RAGAS</option>
              <option value="Custom-Rules">Custom Rules</option>
            </select>
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.06] rounded-xl px-3 py-1.5">
            <Info className="h-3.5 w-3.5 text-zinc-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent text-xs text-zinc-300 font-medium border-none focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Statuses</option>
              <option value={EvaluationStatus.COMPLETED}>Completed</option>
              <option value={EvaluationStatus.FAILED}>Failed</option>
              <option value={EvaluationStatus.SKIPPED}>Skipped</option>
            </select>
          </div>
        </div>
      </div>

      {/* DATA WORKSPACE LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Table List */}
        <div className={`${selectedRecord ? 'lg:col-span-7' : 'lg:col-span-12'} transition-all duration-300`}>
          <div className="glass-card border border-white/5 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.01]">
                    <th className="p-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Timestamp</th>
                    <th className="p-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Evaluation ID</th>
                    <th className="p-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Request ID</th>
                    <th className="p-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Stage</th>
                    <th className="p-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Provider</th>
                    <th className="p-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-right">Latency</th>
                    <th className="p-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-center">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map((r) => {
                      const isSelected = selectedRecord?.evaluationId === r.evaluationId;
                      return (
                        <tr
                          key={r.evaluationId}
                          onClick={() => {
                            setSelectedRecord(r);
                            setInspectTab('parsed');
                          }}
                          className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${
                            isSelected ? 'bg-cyan-500/5' : ''
                          }`}
                        >
                          {/* Timestamp */}
                          <td className="p-4 text-xs text-zinc-300 font-medium whitespace-nowrap">
                            {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          {/* Eval ID */}
                          <td className="p-4 text-xs font-mono text-zinc-400 whitespace-nowrap">
                            {r.evaluationId}
                          </td>
                          {/* Request ID */}
                           <td className="p-4 text-xs font-mono text-cyan-400 whitespace-nowrap">
                            {r.context?.requestId || 'N/A'}
                          </td>
                          {/* Stage */}
                          <td className="p-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-zinc-300 text-[10px] font-semibold uppercase tracking-wider border border-white/[0.06]">
                              {r.context?.stage || 'N/A'}
                            </span>
                          </td>
                          {/* Provider */}
                          <td className="p-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-xs text-white font-semibold">{r.context?.provider || 'Unknown'}</span>
                              <span className="text-[10px] text-zinc-500 font-medium">{r.context?.model || 'Unknown'}</span>
                            </div>
                          </td>
                          {/* Latency */}
                          <td className="p-4 text-xs font-mono text-zinc-400 text-right whitespace-nowrap">
                            {r.latencyMs > 0 ? `${r.latencyMs}ms` : '—'}
                          </td>
                          {/* Overall Score */}
                          <td className="p-4 text-center whitespace-nowrap">
                            {r.status === EvaluationStatus.COMPLETED ? (
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                r.overallScore >= 80 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                  : r.overallScore >= 60 
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                                    : 'bg-zinc-500/10 text-zinc-400 border border-white/10'
                              }`}>
                                {r.overallScore}%
                              </span>
                            ) : r.status === EvaluationStatus.FAILED ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider">
                                ERROR
                              </span>
                            ) : (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/10 text-zinc-400 border border-white/5 uppercase tracking-wider">
                                SKIPPED
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-xs text-zinc-500">
                        No evaluation records found matching current query parameters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Trace Inspector Drawer */}
        <AnimatePresence>
          {selectedRecord && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="col-span-1 lg:col-span-5 bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
                <div>
                  <h3 className="font-extrabold text-white text-base">Trace Inspector</h3>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Audit runs pipeline debugger</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExportJSON(selectedRecord)}
                    className="p-2 hover:bg-white/5 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                    title="Export JSON record"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setSelectedRecord(null)}
                    className="p-2 hover:bg-white/5 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* IDs Inspect Panel */}
              <div className="p-5 border-b border-white/5 bg-black/20 text-[10px] space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-semibold">EVAL ID:</span>
                  <span className="text-zinc-300 font-bold">{selectedRecord.evaluationId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-semibold">REQUEST ID:</span>
                  <span className="text-cyan-400 font-bold">{selectedRecord.context?.requestId || 'N/A'}</span>
                </div>
                {selectedRecord.context?.sessionId && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500 font-semibold">TRACE ID (SESSION):</span>
                    <span className="text-zinc-300 font-bold">{selectedRecord.context?.sessionId}</span>
                  </div>
                )}
              </div>

              {/* Drawer Body Scroll */}
              <div className="p-5 space-y-6 max-h-[600px] overflow-y-auto custom-scrollbar">
                
                {/* 1. Trace Lifecycle Timeline */}
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Evaluation Event Timeline</span>
                  </h4>
                  
                  <div className="border-l border-white/10 ml-2.5 pl-5 space-y-4 text-xs">
                    
                    {/* Started */}
                    <div className="relative">
                      <div className="absolute -left-[26px] top-0.5 p-0.5 bg-zinc-950 rounded-full border border-emerald-500/50 text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                      <span className="font-semibold text-white">Evaluation Started</span>
                      <p className="text-[10px] text-zinc-500">Flags checked; context loaded.</p>
                    </div>

                    {/* Provider Selected */}
                    <div className="relative">
                      <div className="absolute -left-[26px] top-0.5 p-0.5 bg-zinc-950 rounded-full border border-emerald-500/50 text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                      <span className="font-semibold text-white">Provider Selected</span>
                      <p className="text-[10px] text-zinc-500">Resolved to {selectedRecord.context?.provider || 'Unknown'}.</p>
                    </div>

                    {/* Request Sent */}
                    <div className="relative">
                      <div className={`absolute -left-[26px] top-0.5 p-0.5 bg-zinc-950 rounded-full border ${
                        selectedRecord.status === EvaluationStatus.SKIPPED 
                          ? 'border-zinc-500 text-zinc-500' 
                          : 'border-emerald-500/50 text-emerald-400'
                      }`}>
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                      <span className={`font-semibold ${selectedRecord.status === EvaluationStatus.SKIPPED ? 'text-zinc-500' : 'text-white'}`}>
                        Request Dispatched
                      </span>
                      <p className="text-[10px] text-zinc-500">
                        {selectedRecord.status === EvaluationStatus.SKIPPED ? 'Skipped pipeline processing.' : `Endpoint target model: ${selectedRecord.context?.model || 'Unknown'}.`}
                      </p>
                    </div>

                    {/* Response Received & Validated */}
                    {selectedRecord.status !== EvaluationStatus.SKIPPED && (
                      <div className="relative">
                        <div className={`absolute -left-[26px] top-0.5 p-0.5 bg-zinc-950 rounded-full border ${
                          selectedRecord.status === EvaluationStatus.FAILED 
                            ? 'border-red-500 text-red-400' 
                            : 'border-emerald-500/50 text-emerald-400'
                        }`}>
                          {selectedRecord.status === EvaluationStatus.FAILED ? (
                            <AlertCircle className="h-3 w-3" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                        </div>
                        <span className={`font-semibold ${selectedRecord.status === EvaluationStatus.FAILED ? 'text-red-400' : 'text-white'}`}>
                          {selectedRecord.status === EvaluationStatus.FAILED ? 'Response Audit Failed' : 'Response Validated'}
                        </span>
                        <p className="text-[10px] text-zinc-500">
                          {selectedRecord.status === EvaluationStatus.FAILED 
                            ? 'Error parsing downstream model response.' 
                            : 'Zod structural criteria validation: PASS.'}
                        </p>
                      </div>
                    )}

                    {/* Persisted */}
                    <div className="relative">
                      <div className="absolute -left-[26px] top-0.5 p-0.5 bg-zinc-950 rounded-full border border-emerald-500/50 text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                      <span className="font-semibold text-white">Trace Stored</span>
                      <p className="text-[10px] text-zinc-500">Result cached to Repository.</p>
                    </div>

                  </div>
                </div>

                {/* ERROR PANEL IF APPLICABLE */}
                {selectedRecord.status === EvaluationStatus.FAILED && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-1">
                    <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      <span>Execution Error Logged</span>
                    </span>
                    <p className="text-[10px] text-zinc-300 font-mono leading-relaxed break-words">{selectedRecord.errorMessage}</p>
                  </div>
                )}

                {/* 2. Tabs Selector */}
                <div>
                  <div className="flex border-b border-white/5 mb-4">
                    <button
                      onClick={() => setInspectTab('parsed')}
                      className={`flex-1 py-2 text-center text-xs font-bold transition-all border-b-2 cursor-pointer ${
                        inspectTab === 'parsed' 
                          ? 'border-cyan-500 text-cyan-400' 
                          : 'border-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      Metrics Breakdown
                    </button>
                    <button
                      onClick={() => setInspectTab('raw')}
                      className={`flex-1 py-2 text-center text-xs font-bold transition-all border-b-2 cursor-pointer ${
                        inspectTab === 'raw' 
                          ? 'border-cyan-500 text-cyan-400' 
                          : 'border-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      Raw Judge Payload
                    </button>
                    <button
                      onClick={() => setInspectTab('trace')}
                      className={`flex-1 py-2 text-center text-xs font-bold transition-all border-b-2 cursor-pointer ${
                        inspectTab === 'trace' 
                          ? 'border-cyan-500 text-cyan-400' 
                          : 'border-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      AI Pipeline Trace
                    </button>
                  </div>

                  {/* Parsed Tab */}
                  {inspectTab === 'parsed' && (
                    <div className="space-y-4">
                      {selectedRecord.evaluationId.startsWith('eval-pf-') ? (
                        <div className="space-y-4">
                          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Regression Run Summary</span>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <span className="text-zinc-500">Dataset Version</span>
                                <p className="text-white font-bold">{selectedRecord.context?.metadata?.datasetVersion || '1.0.0'}</p>
                              </div>
                              <div>
                                <span className="text-zinc-500">Pass Rate</span>
                                <p className="text-emerald-400 font-bold">
                                  {selectedRecord.context?.metadata?.passCount || 0} / {selectedRecord.context?.metadata?.totalCount || 0} ({selectedRecord.overallScore}% pass)
                                </p>
                              </div>
                              <div>
                                <span className="text-zinc-500">Total Latency</span>
                                <p className="text-white font-bold">{selectedRecord.latencyMs}ms</p>
                              </div>
                              <div>
                                <span className="text-zinc-500">Estimated Cost</span>
                                <p className="text-cyan-400 font-bold">${selectedRecord.context?.metadata?.estimatedCost?.toFixed(4) || '0.0000'}</p>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Failed Regression Cases</span>
                            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1.5">
                              {selectedRecord.context?.metadata?.failedCases && selectedRecord.context.metadata.failedCases.length > 0 ? (
                                selectedRecord.context.metadata.failedCases.map((c: string, idx: number) => (
                                  <div key={idx} className="p-2.5 bg-red-500/5 border border-red-500/10 rounded-lg text-xs flex gap-2 items-start text-red-300">
                                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>{c}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-xs flex gap-2 items-center text-emerald-400">
                                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                                  <span>All regression assertions passed!</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : selectedRecord.status === EvaluationStatus.COMPLETED ? (
                        <>
                          <div className="bg-white/[0.01] border border-white/5 rounded-xl overflow-hidden">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-white/5 bg-white/[0.02] text-zinc-400 font-semibold">
                                  <th className="p-3">Metric</th>
                                  <th className="p-3 text-center">Score</th>
                                  <th className="p-3 text-right">Confidence</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {selectedRecord.metrics.map((m) => (
                                  <React.Fragment key={m.metricId}>
                                    <tr className="hover:bg-white/[0.01]">
                                      <td className="p-3 font-semibold text-white">
                                        <div className="flex flex-col">
                                          <span>{m.name}</span>
                                          <span className="text-[9px] text-zinc-500 uppercase font-mono mt-0.5">{m.metricId}</span>
                                        </div>
                                      </td>
                                      <td className="p-3 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                          m.status === 'pass' 
                                            ? 'bg-emerald-500/10 text-emerald-400' 
                                            : m.status === 'warning' 
                                              ? 'bg-amber-500/10 text-amber-400' 
                                              : 'bg-red-500/10 text-red-400'
                                        }`}>
                                          {m.score}%
                                        </span>
                                      </td>
                                      <td className="p-3 text-right font-mono text-zinc-400">
                                        {Math.round(m.confidence * 100)}%
                                      </td>
                                    </tr>
                                    <tr className="bg-black/10">
                                      <td colSpan={3} className="p-3 pl-6 text-[10px] text-zinc-400 leading-relaxed italic">
                                        "{m.reason}"
                                      </td>
                                    </tr>
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Overall Judge Reasoning */}
                          {selectedRecord.metrics.length > 0 && (
                            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Summary Audit Reasoning</span>
                              <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                                {selectedRecord.metrics[0]?.reason ? 'Evaluations represent consistent scoring across hooks, pacing, CTAs, and compliance parameters.' : 'No overall reasoning summary compiled.'}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="py-8 text-center text-xs text-zinc-500 italic">
                          Metrics breakdown only available for completed evaluations.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Raw Tab */}
                  {inspectTab === 'raw' && (
                    <div className="bg-black/30 border border-white/5 rounded-xl p-4 font-mono text-[10px] text-zinc-400 leading-relaxed overflow-x-auto max-h-96 custom-scrollbar">
                      <pre className="whitespace-pre">{JSON.stringify(selectedRecord, null, 2)}</pre>
                    </div>
                  )}

                  {/* Trace Tab */}
                  {inspectTab === 'trace' && activeTrace && (
                    <div className="space-y-6">
                      
                      {/* Timeline component latency breakdown */}
                      <div className="space-y-3">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Component Latency Breakdown</span>
                        <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-3 text-xs">
                          {activeTrace.events
                            .filter((e: any) => e.status === 'completed' || e.status === 'failed')
                            .map((evt: any) => {
                              const pct = activeTrace.durationMs > 0 
                                ? Math.min(100, Math.round((evt.latencyMs || 0) / activeTrace.durationMs * 100))
                                : 0;
                              return (
                                <div key={evt.eventId} className="space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="font-semibold text-zinc-300">{evt.component} ({evt.stage})</span>
                                    <span className="font-mono text-zinc-400">{evt.latencyMs ?? 0}ms</span>
                                  </div>
                                  <div className="w-full bg-white/[0.04] rounded-full h-1.5 overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${
                                        evt.status === 'failed' ? 'bg-red-500' : 'bg-cyan-500'
                                      }`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Event Explorer List */}
                      <div className="space-y-3">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Trace Timeline Events ({activeTrace.events.length})</span>
                        <div className="border border-white/5 rounded-xl overflow-hidden divide-y divide-white/5 bg-white/[0.01] max-h-60 overflow-y-auto custom-scrollbar">
                          {activeTrace.events.map((evt: any) => {
                            const isSelected = selectedEvent?.eventId === evt.eventId;
                            return (
                              <div
                                key={evt.eventId}
                                onClick={() => setSelectedEvent(evt)}
                                className={`p-3 text-xs flex justify-between items-center hover:bg-white/[0.02] cursor-pointer transition-colors ${
                                  isSelected ? 'bg-cyan-500/5' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full ${
                                    evt.status === 'started' 
                                      ? 'bg-amber-400' 
                                      : evt.status === 'failed' 
                                        ? 'bg-red-500' 
                                        : 'bg-emerald-400'
                                  }`} />
                                  <span className="font-bold text-white">{evt.component}</span>
                                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">({evt.stage})</span>
                                </div>
                                <div className="text-zinc-500 font-mono text-[10px]">
                                  {evt.status === 'completed' && evt.latencyMs ? `${evt.latencyMs}ms` : evt.status}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Event Metadata Viewer */}
                      {selectedEvent && (
                        <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-2">
                          <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-300">
                              Event Metadata: {selectedEvent.component} ({selectedEvent.status})
                            </span>
                            <button
                              onClick={() => setSelectedEvent(null)}
                              className="text-[10px] text-zinc-500 hover:text-zinc-300 focus:outline-none"
                            >
                              Close
                            </button>
                          </div>
                          <pre className="font-mono text-[10px] text-cyan-400 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-40 custom-scrollbar">
                            {JSON.stringify(selectedEvent.metadata, null, 2)}
                          </pre>
                        </div>
                      )}

                    </div>
                  )}
                </div>

                {/* 3. Judge Metadata Info */}
                <div className="border-t border-white/5 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Audit Engine Configuration</span>
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-3 text-[10px] font-mono bg-white/[0.01] border border-white/5 rounded-xl p-3.5">
                    <div>
                      <span className="text-zinc-500 block">JUDGE MODEL</span>
                      <span className="text-zinc-300 font-semibold">{selectedRecord.context?.metadata?.judgeModel || 'gemini-1.5-pro'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">PROMPT VERSION</span>
                      <span className="text-zinc-300 font-semibold">v{selectedRecord.context?.metadata?.judgePromptVersion || '1.0.0'}</span>
                    </div>
                    <div className="mt-2">
                      <span className="text-zinc-500 block">EVAL VERSION</span>
                      <span className="text-zinc-300 font-semibold">{selectedRecord.context?.metadata?.evaluationVersion || 'v1'}</span>
                    </div>
                    <div className="mt-2">
                      <span className="text-zinc-500 block">TIMESTAMP</span>
                      <span className="text-zinc-300 font-semibold whitespace-nowrap">{new Date(selectedRecord.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
        </>
      )}

      {consoleTab === 'experiments' && (
        <div className="space-y-8">
          {experimentsAnalytics.length === 0 ? (
            <div className="text-center py-20 bg-white/[0.01] border border-white/5 rounded-2xl">
              <Sparkles className="h-10 w-10 text-zinc-600 mx-auto mb-4 animate-pulse" />
              <h3 className="text-base font-bold text-white">No Experiments Configured</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-2 leading-relaxed">
                Active prompt template experiments and variant performance assignments will compile here once registered in the runtime.
              </p>
            </div>
          ) : (
            experimentsAnalytics.map((exp: any) => (
              <div key={exp.experimentId} className="glass-card border border-white/5 rounded-2xl p-6 space-y-6">
                
                {/* Experiment Header */}
                <div className="flex justify-between items-start border-b border-white/5 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{exp.experimentName}</h3>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                      Experiment ID: {exp.experimentId}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exp, null, 2));
                        const downloadAnchor = document.createElement('a');
                        downloadAnchor.setAttribute("href", dataStr);
                        downloadAnchor.setAttribute("download", `experiment-${exp.experimentId}-analytics.json`);
                        document.body.appendChild(downloadAnchor);
                        downloadAnchor.click();
                        downloadAnchor.remove();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] text-zinc-300 text-xs font-semibold focus:outline-none transition-all cursor-pointer"
                    >
                      Export Analytics JSON
                    </button>
                  </div>
                </div>

                {/* Variant Performance Grid */}
                <div className="overflow-x-auto border border-white/5 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.01] text-zinc-400 font-semibold">
                        <th className="p-3">Variant Name</th>
                        <th className="p-3 text-center">Assignments</th>
                        <th className="p-3 text-center">Avg Relevance</th>
                        <th className="p-3 text-center">Avg Context Usage</th>
                        <th className="p-3 text-center">Avg Grounding</th>
                        <th className="p-3 text-center">Avg Quality</th>
                        <th className="p-3 text-center bg-cyan-500/5 text-cyan-300">Overall Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {exp.variants.map((v: any) => {
                        const isLeader = v.variantId === exp.leaderVariantId && exp.totalAssignments > 0;
                        return (
                          <tr key={v.variantId} className="hover:bg-white/[0.01]">
                            <td className="p-3 font-semibold text-white flex items-center gap-2">
                              {v.variantName}
                              {isLeader && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 uppercase tracking-wide">
                                  <Star className="h-2.5 w-2.5 fill-current" /> Leader
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center font-mono text-zinc-300">{v.assignmentCount}</td>
                            <td className="p-3 text-center font-mono text-zinc-300">{v.avgRelevance}%</td>
                            <td className="p-3 text-center font-mono text-zinc-300">{v.avgContextUsage}%</td>
                            <td className="p-3 text-center font-mono text-zinc-300">{v.avgGrounding}%</td>
                            <td className="p-3 text-center font-mono text-zinc-300">{v.avgResponseQuality}%</td>
                            <td className="p-3 text-center font-mono font-bold bg-cyan-500/5 text-cyan-300">{v.avgOverallScore}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Score Comparison Visual Bars */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Metric Comparison Summary</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/[0.01] border border-white/5 rounded-xl p-4">
                    {exp.variants.map((v: any) => (
                      <div key={v.variantId} className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-zinc-200">{v.variantName}</span>
                          <span className="font-mono text-cyan-400 font-extrabold">{v.avgOverallScore}% Overall</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                            <span>Relevance</span>
                            <span>{v.avgRelevance}%</span>
                          </div>
                          <div className="w-full bg-white/[0.03] rounded-full h-1">
                            <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${v.avgRelevance}%` }} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                            <span>Context Usage</span>
                            <span>{v.avgContextUsage}%</span>
                          </div>
                          <div className="w-full bg-white/[0.03] rounded-full h-1">
                            <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${v.avgContextUsage}%` }} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                            <span>Grounding</span>
                            <span>{v.avgGrounding}%</span>
                          </div>
                          <div className="w-full bg-white/[0.03] rounded-full h-1">
                            <div className="bg-violet-500 h-full rounded-full" style={{ width: `${v.avgGrounding}%` }} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                            <span>Quality</span>
                            <span>{v.avgResponseQuality}%</span>
                          </div>
                          <div className="w-full bg-white/[0.03] rounded-full h-1">
                            <div className="bg-purple-500 h-full rounded-full" style={{ width: `${v.avgResponseQuality}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ))
          )}
        </div>
      )}

      {consoleTab === 'streaming' && (
        <div className="space-y-8 animate-fadeIn">
          <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.01]">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              Streaming Sandbox Console
            </h2>
            <p className="text-xs text-zinc-400 mb-6">
              Test real-time provider prompt token streams, abort cancellations, pause/resume session logs, and trace latency metrics.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* INPUT CONTROLS */}
              <div className="lg:col-span-1 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Prompt</label>
                  <textarea
                    value={streamPrompt}
                    onChange={(e) => setStreamPrompt(e.target.value)}
                    rows={4}
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl p-3.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all resize-none"
                    placeholder="Enter prompt..."
                    disabled={streamStatus === 'active' || streamStatus === 'paused'}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Provider</label>
                    <select
                      value={streamProvider}
                      onChange={(e) => setStreamProvider(e.target.value)}
                      className="w-full bg-zinc-900 border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all cursor-pointer"
                      disabled={streamStatus === 'active' || streamStatus === 'paused'}
                    >
                      <option value="mock">mock (native stream)</option>
                      <option value="non-streaming">non-streaming (fallback)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Model</label>
                    <input
                      type="text"
                      value={streamModel}
                      onChange={(e) => setStreamModel(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                      placeholder="model name..."
                      disabled={streamStatus === 'active' || streamStatus === 'paused'}
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  {streamStatus === 'idle' || streamStatus === 'completed' || streamStatus === 'error' || streamStatus === 'cancelled' ? (
                    <button
                      onClick={startStreaming}
                      className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-cyan-500/10 focus:outline-none"
                    >
                      <Play className="w-3.5 h-3.5 fill-black" />
                      Start Stream Generation
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      {streamStatus === 'active' ? (
                        <button
                          onClick={pauseStreaming}
                          className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-4 rounded-xl text-xs cursor-pointer focus:outline-none transition-all"
                        >
                          Pause
                        </button>
                      ) : (
                        <button
                          onClick={resumeStreaming}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 px-4 rounded-xl text-xs cursor-pointer focus:outline-none transition-all"
                        >
                          Resume
                        </button>
                      )}
                      <button
                        onClick={cancelStreaming}
                        className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold py-3 px-4 rounded-xl text-xs cursor-pointer focus:outline-none transition-all border border-red-500/30"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* OUTPUT DISPLAY */}
              <div className="lg:col-span-2 flex flex-col border border-white/5 rounded-2xl bg-black/20 overflow-hidden min-h-[300px]">
                {/* Header Info Panel */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      streamStatus === 'active' ? 'bg-cyan-400 animate-pulse' :
                      streamStatus === 'paused' ? 'bg-amber-400' :
                      streamStatus === 'completed' ? 'bg-emerald-400' :
                      streamStatus === 'cancelled' ? 'bg-zinc-500' :
                      streamStatus === 'error' ? 'bg-red-500' : 'bg-zinc-700'
                    }`} />
                    <span className="text-xs font-mono text-zinc-300 capitalize">{streamStatus}</span>
                  </div>
                  <div className="flex gap-4 text-[10px] text-zinc-400 font-mono">
                    <div>Tokens: <span className="text-cyan-400 font-bold">{streamTokens}</span></div>
                    <div>Latency: <span className="text-cyan-400 font-bold">{streamLatency}ms</span></div>
                  </div>
                </div>

                {/* Tokens Box */}
                <div className="flex-1 p-5 text-sm font-mono text-zinc-200 overflow-y-auto leading-relaxed custom-scrollbar whitespace-pre-wrap select-text selection:bg-cyan-500/30 max-h-[400px]">
                  {streamOutput || <span className="text-zinc-600 italic">Incremental tokens will render here...</span>}
                  
                  {streamStatus === 'active' && (
                    <span className="inline-block w-1.5 h-4 bg-cyan-400 animate-pulse ml-0.5" />
                  )}
                </div>

                {/* Footer Telemetry */}
                {streamMetadata && (
                  <div className="p-4 bg-white/[0.02] border-t border-white/5 text-[10px] text-zinc-500 font-mono grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <span className="block text-zinc-600">STREAM ID</span>
                      <span className="text-zinc-400 font-semibold">{streamMetadata.streamId}</span>
                    </div>
                    <div>
                      <span className="block text-zinc-600">1ST TOKEN LATENCY</span>
                      <span className="text-zinc-400 font-semibold text-emerald-400">{streamMetadata.firstTokenLatency}ms</span>
                    </div>
                    <div>
                      <span className="block text-zinc-600">COMPLETION LATENCY</span>
                      <span className="text-zinc-400 font-semibold text-emerald-400">{streamMetadata.completionLatency}ms</span>
                    </div>
                    <div>
                      <span className="block text-zinc-600">GENERATION SPEED</span>
                      <span className="text-zinc-400 font-semibold">
                        {streamMetadata.completionLatency > 0 
                          ? Math.round((streamMetadata.tokenCount / (streamMetadata.completionLatency / 1000)) * 10) / 10 
                          : 0} tokens/sec
                      </span>
                    </div>
                  </div>
                )}

                {streamError && (
                  <div className="p-4 bg-red-500/5 text-xs text-red-400 border-t border-red-500/10 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{streamError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {consoleTab === 'tools' && (
        <div className="space-y-8 animate-fadeIn">
          <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.01]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-cyan-400" />
                  AI Tool Calling Registry Sandbox
                </h2>
                <p className="text-xs text-zinc-400">
                  Inspect registered schemas, call functions in an isolated sandbox environment, and review trace logs.
                </p>
              </div>

              {toolExecutionHistory.length > 0 && (
                <button
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(toolExecutionHistory, null, 2));
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute("href", dataStr);
                    downloadAnchor.setAttribute("download", `tool_execution_history_${Date.now()}.json`);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                  }}
                  className="bg-white/5 hover:bg-white/10 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all border border-white/15 focus:outline-none"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export History JSON
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* TOOL SCHEMAS LIST */}
              <div className="xl:col-span-1 border border-white/5 rounded-2xl bg-black/20 p-4 space-y-4">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Registered Tool Registry ({registeredTools.length})</span>
                <div className="space-y-2 max-h-[450px] overflow-y-auto custom-scrollbar">
                  {registeredTools.map((t) => {
                    const isSelected = selectedTool?.name === t.name;
                    return (
                      <div
                        key={t.name}
                        onClick={() => setSelectedTool(t)}
                        className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
                          isSelected 
                            ? 'bg-cyan-500/5 border-cyan-500/30' 
                            : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-xs font-bold text-white font-mono">{t.name}</span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/[0.05] text-zinc-400 uppercase tracking-wider">{t.category}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">{t.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* TOOL INTERACTIVE SANDBOX */}
              <div className="xl:col-span-2 space-y-6">
                {selectedTool ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Schema details & Inputs */}
                    <div className="space-y-4">
                      <div className="border border-white/5 rounded-2xl bg-white/[0.01] p-5 space-y-3">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-bold text-white font-mono">{selectedTool.name}</h3>
                          <span className="text-[10px] text-zinc-500 font-mono">Category: {selectedTool.category}</span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">{selectedTool.description}</p>

                        <div className="pt-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-2">Required Parameters</span>
                          {selectedTool.schema?.parameters?.required && selectedTool.schema.parameters.required.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {selectedTool.schema.parameters.required.map((req: string) => (
                                <span key={req} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded border border-red-500/10 font-mono">{req}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-600 italic">None required.</span>
                          )}
                        </div>

                        <div className="pt-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-1.5">Property Schema Types</span>
                          <div className="space-y-1 text-[11px] font-mono text-zinc-500 max-h-40 overflow-y-auto custom-scrollbar">
                            {Object.entries(selectedTool.schema?.parameters?.properties || {}).map(([key, val]: [string, any]) => (
                              <div key={key} className="flex justify-between items-baseline py-1 border-b border-white/[0.02]">
                                <span className="text-zinc-300 font-semibold">{key}</span>
                                <span>{val.type} {val.enum ? `[${val.enum.join('|')}]` : ''}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Inputs sandbox editor */}
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">Arguments Input JSON</label>
                        <textarea
                          value={toolArgumentsInput}
                          onChange={(e) => setToolArgumentsInput(e.target.value)}
                          rows={6}
                          className="w-full bg-zinc-955 border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl p-3.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono leading-relaxed resize-none"
                          disabled={executingTool}
                        />
                      </div>

                      <button
                        onClick={runToolSandbox}
                        disabled={executingTool}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 text-black font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-cyan-500/10 focus:outline-none disabled:cursor-not-allowed"
                      >
                        {executingTool ? (
                          <>
                            <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                            Executing Tool call...
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-black" />
                            Execute Sandbox Tool Call
                          </>
                        )}
                      </button>
                    </div>

                    {/* Result Output Inspector */}
                    <div className="flex flex-col border border-white/5 rounded-2xl bg-black/25 overflow-hidden min-h-[300px]">
                      <div className="flex justify-between items-center px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2">
                          {toolSandboxResult ? (
                            <>
                              <span className={`h-2.5 w-2.5 rounded-full ${
                                toolSandboxResult.success ? 'bg-emerald-400' : 'bg-red-500'
                              }`} />
                              <span className="text-xs font-mono text-zinc-300 capitalize">{toolSandboxResult.status}</span>
                            </>
                          ) : (
                            <span className="text-xs text-zinc-500">Execution Output</span>
                          )}
                        </div>
                        {toolSandboxResult && (
                          <div className="text-[10px] text-zinc-500 font-mono">
                            Latency: <span className="text-cyan-400 font-semibold">{toolSandboxResult.latencyMs}ms</span> | Retries: <span className="text-cyan-400 font-semibold">{toolSandboxResult.retryCount}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 p-5 text-xs font-mono text-zinc-200 overflow-y-auto leading-relaxed custom-scrollbar whitespace-pre-wrap select-text max-h-[320px]">
                        {toolSandboxResult ? (
                          toolSandboxResult.success ? (
                            JSON.stringify(toolSandboxResult.output, null, 2)
                          ) : (
                            <span className="text-red-400">{toolSandboxResult.error}</span>
                          )
                        ) : (
                          <span className="text-zinc-600 italic">Run tool to inspect JSON output results...</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20 bg-white/[0.01] border border-white/5 rounded-2xl">
                    <Layers className="h-10 w-10 text-zinc-600 mx-auto mb-4" />
                    <h3 className="text-sm font-bold text-white">No tool selected</h3>
                    <p className="text-xs text-zinc-500 mt-2">Select a tool from the registry to execute.</p>
                  </div>
                )}
              </div>
            </div>

            {/* AUDIT EXECUTION HISTORY */}
            {toolExecutionHistory.length > 0 && (
              <div className="mt-8 border-t border-white/5 pt-8 space-y-4">
                <span className="text-xs uppercase font-bold tracking-wider text-zinc-400 block">Execution Audit Log History</span>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* History table */}
                  <div className="lg:col-span-2 border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5 bg-white/[0.01] max-h-80 overflow-y-auto custom-scrollbar">
                    {toolExecutionHistory.map((item) => {
                      const isSelected = selectedToolExecution?.executionId === item.executionId;
                      return (
                        <div
                          key={item.executionId}
                          onClick={() => setSelectedToolExecution(item)}
                          className={`p-3.5 text-xs flex justify-between items-center hover:bg-white/[0.02] cursor-pointer transition-colors ${
                            isSelected ? 'bg-cyan-500/5' : ''
                          }`}
                        >
                          <div className="space-y-1">
                            <span className="font-bold text-white font-mono">{item.toolName}</span>
                            <span className="text-[10px] text-zinc-500 block font-mono">{item.executionId}</span>
                          </div>
                          <div className="flex items-center gap-6 font-mono text-[10px]">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              item.success 
                                ? 'bg-emerald-500/10 text-emerald-400' 
                                : 'bg-red-500/10 text-red-400'
                            }`}>{item.status}</span>
                            <span className="text-zinc-400">{item.latencyMs}ms</span>
                            <span className="text-zinc-500">{new Date(item.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Inspector Panel */}
                  <div className="lg:col-span-1 border border-white/5 rounded-2xl bg-black/20 p-4 space-y-4 flex flex-col justify-between max-h-80 overflow-y-auto custom-scrollbar text-xs">
                    {selectedToolExecution ? (
                      <div className="space-y-3 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                            <span className="font-bold text-white font-mono">{selectedToolExecution.toolName}</span>
                            <span className="text-[9px] text-zinc-500 font-mono">{selectedToolExecution.executionId}</span>
                          </div>

                          <div className="mt-3 space-y-1 leading-relaxed">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Input Arguments</span>
                            <pre className="bg-black/40 border border-white/5 rounded-lg p-2 text-[10px] text-zinc-400 overflow-x-auto leading-normal">
                              {JSON.stringify(selectedToolExecution.arguments, null, 2)}
                            </pre>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-white/5 flex justify-between text-[10px] font-mono text-zinc-500">
                          <div>Retries: <span className="text-cyan-400">{selectedToolExecution.retryCount}</span></div>
                          <div>Status: <span className={selectedToolExecution.success ? 'text-emerald-400' : 'text-red-400'}>{selectedToolExecution.status}</span></div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-10 text-zinc-600 italic">Select history entry to inspect details...</div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
