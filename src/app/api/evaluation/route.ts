import { NextResponse } from 'next/server';
import { EvaluationRepositoryFactory } from '../../../ai/evaluation/storage/repositoryFactory';
import { EvaluationResult } from '../../../ai/evaluation/types';

function sanitizeEvaluation(run: EvaluationResult) {
  // Map raw evaluation database rows into the clean dashboard contract
  // Never expose raw generated content, user prompts, api keys, or tenant context.
  return {
    evaluationId: run.evaluationId,
    decision: run.decision || 'PASS',
    overallScore: run.overallScore,
    provider: run.context.provider || 'Unknown',
    model: run.context.model || 'Unknown',
    latencyMs: run.latencyMs || 0,
    createdAt: run.createdAt,
    status: run.status,
    tokenUsage: run.context.metadata?.tokenUsage || { prompt: 0, completion: 0, total: 0 },
    estimatedCost: run.context.metadata?.estimatedCost || 0.0,
    source: run.evaluationId.startsWith('eval-pf-') ? 'promptfoo' : 'runtime',
    metrics: (run.metrics || []).map(m => ({
      metricId: m.metricId,
      name: m.name,
      score: m.score,
      status: m.status,
      reason: m.reason
    }))
  };
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Unauthorized: Missing or invalid token." }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const parts = token.split('.');
    if (parts.length !== 3) {
      return NextResponse.json({ error: "Unauthorized: Malformed JWT." }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    } catch (e) {
      return NextResponse.json({ error: "Unauthorized: Invalid JWT encoding." }, { status: 401 });
    }

    const creatorId = payload.userId || payload.sub || payload.id;
    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized: Missing user identity in token." }, { status: 401 });
    }

    const tenantId = payload.tenantId || payload.tenant;
    if (!tenantId || tenantId === 'default') {
      return NextResponse.json({ error: "Unauthorized: Missing or unauthorized tenant context." }, { status: 401 });
    }

    // Extract workspace search query params
    const { searchParams } = new URL(request.url);
    const queryWorkspaceId = searchParams.get('workspaceId');

    const allowedWorkspaces = payload.workspaces || [];
    const requestedWorkspaceId = queryWorkspaceId || payload.workspaceId || payload.activeWorkspaceId;

    if (!requestedWorkspaceId) {
      return NextResponse.json({ error: "Bad Request: Missing workspace context." }, { status: 400 });
    }

    const hasAccess = 
      requestedWorkspaceId === payload.workspaceId || 
      requestedWorkspaceId === payload.activeWorkspaceId || 
      allowedWorkspaces.includes(requestedWorkspaceId) ||
      allowedWorkspaces.some((w: any) => w === requestedWorkspaceId || w.id === requestedWorkspaceId);

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden: Inconsistent workspace authorization." }, { status: 403 });
    }

    const workspaceId = requestedWorkspaceId;
    const repository = EvaluationRepositoryFactory.getRepository();

    // Support fetching a single run by ID
    const singleId = searchParams.get('id');
    if (singleId) {
      const run = await repository.getById(singleId, tenantId, workspaceId);
      if (!run) {
        return NextResponse.json({ error: "Not Found: Evaluation run not found or unauthorized." }, { status: 404 });
      }
      return NextResponse.json(sanitizeEvaluation(run));
    }

    // Support fetching by requestId
    const requestId = searchParams.get('requestId');
    if (requestId) {
      const runs = await repository.getByRequestId(requestId, tenantId, workspaceId);
      return NextResponse.json(runs.map(sanitizeEvaluation));
    }

    // Default: List recent runs
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam) : 50;
    const runs = await repository.listRecent(tenantId, workspaceId, limit);
    return NextResponse.json(runs.map(sanitizeEvaluation));
  } catch (err: any) {
    console.error("[Evaluation API] GET handler failed:", err.message);
    return NextResponse.json(
      { error: "An internal error occurred while fetching evaluations." },
      { status: 500 }
    );
  }
}
