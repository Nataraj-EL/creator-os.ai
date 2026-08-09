import { NextResponse } from 'next/server';
import { generateContent, generateContentStream } from '../../../../lib/generationService';
import { z } from 'zod';

const generationRequestSchema = z.object({
  title: z.string().min(1).max(200),
  topic: z.string().min(1).max(5000),
  primaryGoal: z.enum(['Reach', 'Engagement', 'Conversion']).default('Reach'),
  workspaceId: z.string().min(1).max(100).optional(),
  creatorId: z.string().min(1).max(100).optional(),
  stream: z.boolean().optional()
}).strict();

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > 50 * 1024) {
      return NextResponse.json({ error: "Payload Too Large: Maximum request size is 50KB." }, { status: 413 });
    }

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

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (err) {
      return NextResponse.json({ error: "Bad Request: Malformed JSON body." }, { status: 400 });
    }

    const parseResult = generationRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Bad Request: Parameter validation failed." }, { status: 400 });
    }

    const { title, topic, primaryGoal, workspaceId: bodyWorkspaceId } = parseResult.data;

    // Validate tenant/workspace context isolation (prevent IDOR)
    const allowedWorkspaces = payload.workspaces || [];
    const requestedWorkspaceId = bodyWorkspaceId || payload.workspaceId || payload.activeWorkspaceId;

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
    const traceId = request.headers.get('X-Trace-Id') || `trace-gen-${crypto.randomUUID()}`;
    const requestId = request.headers.get('X-Request-Id') || `req-gen-${crypto.randomUUID()}`;

    // Read configurable timeout (default to 15s)
    const timeoutMs = process.env.GENERATION_TIMEOUT_MS ? parseInt(process.env.GENERATION_TIMEOUT_MS) : 15000;
    const controller = new AbortController();

    if (body.stream === true) {
      // Connect request abort signal to generation execution controller
      const requestSignal = request.signal;
      requestSignal.addEventListener('abort', () => {
        controller.abort();
      });

      // Stream timeout setup
      const streamTimeout = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      const stream = new ReadableStream({
        async start(streamController) {
          try {
            await generateContentStream(
              creatorId,
              workspaceId,
              title,
              topic,
              primaryGoal || 'Reach',
              {
                authorization: authHeader,
                traceId,
                requestId,
                tenantId,
                signal: controller.signal
              },
              (event) => {
                const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
                streamController.enqueue(new TextEncoder().encode(payload));
              }
            );

            // Asynchronously trigger Promptfoo demo evaluation on success
            if (process.env.PROMPTFOO_RUNTIME_DEMO === 'true') {
              import('../../../../ai/evaluation/promptfoo/runner')
                .then(({ runRegression }) => {
                  runRegression({
                    providerName: 'mock',
                    modelName: 'mock-model',
                    mockMode: true,
                    tenantId,
                    workspaceId
                  }).catch(err => {
                    console.error('[Promptfoo-Demo] Async runner failed:', err.message);
                  });
                })
                .catch(err => {
                  console.error('[Promptfoo-Demo] Failed to dynamically load runner:', err.message);
                });
            }
          } catch (err: any) {
            // Error events are emitted via generateContentStream, clean closure ensures safety
          } finally {
            clearTimeout(streamTimeout);
            streamController.close();
          }
        },
        cancel() {
          controller.abort();
          clearTimeout(streamTimeout);
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        }
      });
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        controller.abort();
        reject(new Error(`Content generation timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    });

    const generationPromise = generateContent(
      creatorId,
      workspaceId,
      title,
      topic,
      primaryGoal || 'Reach',
      {
        authorization: authHeader,
        traceId,
        requestId,
        tenantId,
        workspaceId,
        signal: controller.signal
      }
    );

    const result = await Promise.race([generationPromise, timeoutPromise]);

    // Asynchronously trigger Promptfoo demo evaluation on success
    if (process.env.PROMPTFOO_RUNTIME_DEMO === 'true') {
      import('../../../../ai/evaluation/promptfoo/runner')
        .then(({ runRegression }) => {
          runRegression({
            providerName: 'mock',
            modelName: 'mock-model',
            mockMode: true,
            tenantId,
            workspaceId
          }).catch(err => {
            console.error('[Promptfoo-Demo] Async runner failed:', err.message);
          });
        })
        .catch(err => {
          console.error('[Promptfoo-Demo] Failed to dynamically load runner:', err.message);
        });
    }

    return NextResponse.json(result.data);
  } catch (err: any) {
    console.error("[Server Generation Route] execution failed:", err.message);
    const isQualityGate = err.name === 'QualityGateError' || err.message.includes('Quality gate failed');
    const isEvalRuntime = err.name === 'EvaluationRuntimeError' || err.message.includes('Evaluation failed');
    const isTimeout = !isEvalRuntime && (err.message.includes('timed out') || err.message.includes('timeout'));
    const isPolicy = err.name === 'PolicyError' || err.message.includes('Policy Denied');
    
    let code = 500;
    if (isTimeout) code = 504;
    else if (isPolicy) code = 403;
    else if (isQualityGate) code = 422;
    
    // Normalize and sanitize error message (never expose internal secrets or stack dumps)
    let displayMessage = "An error occurred during content generation.";
    if (isTimeout) {
      displayMessage = `Request timed out. Please try again.`;
    } else if (isPolicy) {
      displayMessage = err.message;
    } else if (isQualityGate) {
      displayMessage = "Content quality gate check failed.";
    }
    
    return NextResponse.json(
      { error: displayMessage },
      { status: code }
    );
  }
}
