import { NextResponse } from 'next/server';
import { generateContent } from '../../../../lib/generationService';

export async function POST(request: Request) {
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

    const body = await request.json();
    const { title, topic, primaryGoal, workspaceId: bodyWorkspaceId } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: "Bad Request: Title is required." }, { status: 400 });
    }
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return NextResponse.json({ error: "Bad Request: Topic is required." }, { status: 400 });
    }

    const workspaceId = payload.workspaceId || payload.activeWorkspaceId || bodyWorkspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: "Bad Request: Missing workspace context." }, { status: 400 });
    }

    const traceId = request.headers.get('X-Trace-Id') || `trace-gen-${crypto.randomUUID()}`;
    const requestId = request.headers.get('X-Request-Id') || `req-gen-${crypto.randomUUID()}`;

    // Read configurable timeout (default to 15s)
    const timeoutMs = process.env.GENERATION_TIMEOUT_MS ? parseInt(process.env.GENERATION_TIMEOUT_MS) : 15000;
    const controller = new AbortController();

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
        signal: controller.signal
      }
    );

    const result = await Promise.race([generationPromise, timeoutPromise]);

    return NextResponse.json(result.data);
  } catch (err: any) {
    console.error("[Server Generation Route] execution failed:", err.message);
    const isTimeout = err.message.includes('timed out') || err.message.includes('timeout');
    const isPolicy = err.name === 'PolicyError' || err.message.includes('Policy Denied');
    
    const code = isTimeout ? 504 : (isPolicy ? 403 : 500);
    
    // Normalize and sanitize error message (never expose internal secrets or stack dumps)
    let displayMessage = "An error occurred during content generation.";
    if (isTimeout) {
      displayMessage = `Request timed out. Please try again.`;
    } else if (isPolicy) {
      displayMessage = err.message;
    }
    
    return NextResponse.json(
      { error: displayMessage },
      { status: code }
    );
  }
}
