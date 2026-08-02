# AI Prompt Builder & Integration (Sprint 9)

The AI Prompt Builder is a provider-agnostic prompt formatter that maps system directives, context memory blocks, and user request strings into structured packages, translating them at the request adapter layer.

---

## Technical Architecture

The generation service updates perform context retrievals, package compilation, and tracing updates inside the core Axios handle adapter.

```text
       ┌────────────────────────────────────────────────────────┐
       │             generateContent Service Entry              │
       └───────────────────────────┬────────────────────────────┘
                                   │
                     Run Generation Handlers Loop
                                   │
                                   ▼
                   [GenerationHandler.handle Adapter]
                                   │
                    Check flag: CONTEXT_INJECTION
                                   │
               ┌───────────────────┴───────────────────┐
               ▼ (Yes)                                 ▼ (No)
     [ContextAssemblyRuntime]                [Transmit original topic]
     Retrieve blocks list
               │
               ▼
       [PromptBuilder]
     Compose PromptPackage
     (system, context, user, metadata)
               │
               ▼
      [Adapter Format Phase]
    Interpolate package to single 
    formatted topic request body
               │
               ▼
     [Metadata Trace Sync]
    Propagate selectedMemoryIds 
    and promptVersion to context
               │
               ▼
      [Transmit Axios POST] ───────────────────────► Outbound API
```

---

## Provider-Agnostic Prompt Package (`PromptPackage`)

The Prompt Builder isolates prompt schemas from target API contracts by returning a structured `PromptPackage`:
* **`systemInstructions`**: Global behavior instructions and variables rules.
* **`contextBlocks`**: Ordered list of formatted memories carrying audit logs metadata (IDs and selection justifications).
* **`userPrompt`**: The raw text instructions requested by the user.
* **`metadata`**: Tracing information carrying audit keys, strategy parameters, and `promptVersion`.

---

## Request Adapter Layer Translation

To keep inputs read-only, formatting changes are applied only inside `GenerationHandler.handle` before Axios requests are dispatched:
```typescript
const promptPackage = PromptBuilder.build(request.topic, contextResult);

// Formats promptPackage parameters to suit the Backend API body contract
const formattedBlocks = promptPackage.contextBlocks.join('\n\n');
const finalTopic = `${promptPackage.systemInstructions}\n\nRelevant Context:\n${formattedBlocks}\n\nPrompt: ${promptPackage.userPrompt}`;

// Outbound request
const response = await apiClient.post('/api/v1/workspaces/...', {
  topic: finalTopic, // formatted payload
  ...
});
```

---

## Trace Propagation Channels

Tracing keys and selected memory arrays are written directly into `context.metadata`, ensuring downstream middlewares (like `EvaluationMiddleware` or custom database loggers) ingest them automatically:
```typescript
context.metadata = {
  ...context.metadata,
  selectedMemoryIds: contextResult.blocks.map(b => b.id),
  promptVersion: promptPackage.metadata.promptVersion
};
```

---

## Feature Flags Control (`promptFeatureFlags`)

* `CONTEXT_INJECTION`: Enables retrieving context memories before LLM requests.
* `PROMPT_BUILDER`: Compiles the structured prompt package. If false, context blocks are bypassed.
