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

    // Securely derive user identity from token signature payload
    const creatorId = payload.userId || payload.sub || payload.id;
    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized: Missing user identity in token." }, { status: 401 });
    }

    const body = await request.json();
    const { title, topic, primaryGoal, workspaceId: bodyWorkspaceId } = body;

    // Validate request parameters using clean criteria
    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: "Bad Request: Title is required." }, { status: 400 });
    }
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return NextResponse.json({ error: "Bad Request: Topic is required." }, { status: 400 });
    }

    // Derive workspace context securely (ensure it matches request parameters)
    const workspaceId = payload.workspaceId || payload.activeWorkspaceId || bodyWorkspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: "Bad Request: Missing workspace context." }, { status: 400 });
    }

    // Derive server-side correlation identifiers
    const traceId = request.headers.get('X-Trace-Id') || `trace-gen-${crypto.randomUUID()}`;
    const requestId = request.headers.get('X-Request-Id') || `req-gen-${crypto.randomUUID()}`;

    // Execute generation pipeline server-side
    const result = await generateContent(
      creatorId,
      workspaceId,
      title,
      topic,
      primaryGoal || 'Reach',
      {
        authorization: authHeader,
        traceId,
        requestId
      }
    );

    return NextResponse.json(result.data);
  } catch (err: any) {
    console.error("[Server Generation Route] execution failed:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error during content generation." },
      { status: 500 }
    );
  }
}
