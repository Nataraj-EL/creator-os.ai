import { runRegression } from './runner';
import { traceEventBus } from '../../observability';

function scrubSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(scrubSensitiveData);
  }

  if (typeof obj === 'object') {
    const res: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('workspaceid') ||
        lowerKey.includes('creatorid') ||
        lowerKey.includes('tenantid')
      ) {
        res[key] = '[REDACTED]';
      } else {
        res[key] = scrubSensitiveData(value);
      }
    }
    return res;
  }

  if (typeof obj === 'string') {
    return obj.replace(/Bearer\s+[A-Za-z0-9-_=.]+/gi, 'Bearer [REDACTED]');
  }

  return obj;
}

async function main() {
  const args = process.argv.slice(2);
  const providerIndex = args.indexOf('--provider');
  const modelIndex = args.indexOf('--model');

  const providerName = providerIndex !== -1 ? args[providerIndex + 1] : 'mock';
  const modelName = modelIndex !== -1 ? args[modelIndex + 1] : 'mock-model';
  const mockMode = providerName === 'mock';

  console.log(`[Promptfoo-CLI] Executing regression run on provider: "${providerName}" | model: "${modelName}"...`);

  try {
    const { results, summary } = await runRegression({
      providerName,
      modelName,
      mockMode
    });

    console.log('\n================ REGRESSION SUMMARY ================');
    console.log(`Total Cases: ${summary.total}`);
    console.log(`Passed:      ${summary.passed}`);
    console.log(`Failed:      ${summary.failed}`);
    console.log('====================================================\n');

    // Publish to telemetry traceEventBus with sanitized inputs
    for (const r of results) {
      const sanitizedContext = scrubSensitiveData(r.context);
      const sanitizedMetrics = scrubSensitiveData(r.metrics);

      traceEventBus.publish({
        traceId: r.context.requestId,
        requestId: r.context.requestId,
        component: 'PromptfooRunner',
        stage: 'EVALUATION',
        status: r.status === 'COMPLETED' ? 'completed' : 'failed',
        metadata: {
          provider: providerName,
          model: modelName,
          overallScore: r.overallScore,
          latencyMs: r.latencyMs,
          decision: r.decision,
          context: sanitizedContext,
          metrics: sanitizedMetrics
        }
      });
    }

    if (!summary.success) {
      console.error('[Promptfoo-CLI] Regression test run failed configured thresholds.');
      process.exit(1);
    }

    console.log('[Promptfoo-CLI] All regression tests passed successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('[Promptfoo-CLI] Execution failed with error:', err.message);
    process.exit(1);
  }
}

// Do not execute during next build or normal application startup
if (require.main === module) {
  main();
}
