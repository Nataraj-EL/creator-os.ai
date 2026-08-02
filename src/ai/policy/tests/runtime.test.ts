import test from 'node:test';
import assert from 'node:assert';
import { 
  Policy, 
  PolicyRegistry, 
  PolicyRuntime, 
  PolicyError, 
  featureFlags 
} from '../index';

test('Policy Runtime Test Suite', async (t) => {

  const registry = new PolicyRegistry();
  const runtime = new PolicyRuntime(registry);

  await t.test('1. PolicyRegistry basic CRUD and priority sorting', () => {
    const policy1: Policy = {
      id: 'p1',
      version: '1.0.0',
      description: 'First policy',
      tags: ['low'],
      stage: 'PRE_PROVIDER',
      severity: 'LOW',
      priority: 10,
      enabled: true,
      evaluate: async (content) => ({ decision: 'ALLOW', policyId: 'p1' })
    };

    const policy2: Policy = {
      id: 'p2',
      version: '1.0.0',
      description: 'Second policy',
      tags: ['high'],
      stage: 'PRE_PROVIDER',
      severity: 'HIGH',
      priority: 5, // Runs before p1 since priority 5 < 10
      enabled: true,
      evaluate: async (content) => ({ decision: 'ALLOW', policyId: 'p2' })
    };

    registry.register(policy1);
    registry.register(policy2);

    const sorted = registry.getPolicies('PRE_PROVIDER');
    assert.strictEqual(sorted.length, 2);
    assert.strictEqual(sorted[0].id, 'p2'); // lowest priority number runs first
    assert.strictEqual(sorted[1].id, 'p1');

    // Replace policy
    const policy2Updated: Policy = {
      ...policy2,
      description: 'Updated second policy'
    };
    registry.replace(policy2Updated);
    assert.strictEqual(registry.resolve('p2').description, 'Updated second policy');

    // Disable policy
    registry.disable('p1');
    const active = registry.getPolicies('PRE_PROVIDER').filter(p => p.enabled);
    assert.strictEqual(active.length, 1);
    assert.strictEqual(active[0].id, 'p2');

    registry.enable('p1');
  });

  await t.test('2. Async policies and multiple modifications', async () => {
    featureFlags.POLICY_RUNTIME = true;
    registry.clear();

    const modifyPolicy1: Policy = {
      id: 'modify-1',
      version: '1.0.0',
      stage: 'PRE_PROVIDER',
      severity: 'LOW',
      priority: 1,
      enabled: true,
      evaluate: async (content) => {
        return {
          decision: 'MODIFY',
          modifiedContent: content + ' (mod1)',
          policyId: 'modify-1'
        };
      }
    };

    const modifyPolicy2: Policy = {
      id: 'modify-2',
      version: '1.0.0',
      stage: 'PRE_PROVIDER',
      severity: 'LOW',
      priority: 2,
      enabled: true,
      evaluate: (content) => {
        // Sync policy return
        return {
          decision: 'MODIFY',
          modifiedContent: content + ' (mod2)',
          policyId: 'modify-2'
        };
      }
    };

    registry.register(modifyPolicy1);
    registry.register(modifyPolicy2);

    const report = await runtime.evaluate('PRE_PROVIDER', 'Start prompt', {});
    assert.strictEqual(report.passed, true);
    assert.strictEqual(report.modified, true);
    assert.strictEqual(report.finalContent, 'Start prompt (mod1) (mod2)');
    assert.strictEqual(report.modifications.length, 2);

    featureFlags.POLICY_RUNTIME = false;
  });

  await t.test('3. Warnings collection and execution report', async () => {
    featureFlags.POLICY_RUNTIME = true;
    registry.clear();

    const warnPolicy: Policy = {
      id: 'warn-1',
      version: '1.0.0',
      stage: 'POST_PROVIDER',
      severity: 'MEDIUM',
      priority: 1,
      enabled: true,
      evaluate: async (content) => {
        return {
          decision: 'WARN',
          reason: 'Sensitivity trigger warning',
          policyId: 'warn-1'
        };
      }
    };

    registry.register(warnPolicy);

    const report = await runtime.evaluate('POST_PROVIDER', 'Generated Content', {});
    assert.strictEqual(report.passed, true);
    assert.strictEqual(report.warnings.length, 1);
    assert.strictEqual(report.warnings[0].policyId, 'warn-1');
    assert.strictEqual(report.warnings[0].reason, 'Sensitivity trigger warning');
    assert.strictEqual(report.warnings[0].severity, 'MEDIUM');

    featureFlags.POLICY_RUNTIME = false;
  });

  await t.test('4. PolicyError serialization on BLOCK decisions', async () => {
    featureFlags.POLICY_RUNTIME = true;
    registry.clear();

    const blockPolicy: Policy = {
      id: 'block-1',
      version: '1.0.0',
      stage: 'PRE_PROVIDER',
      severity: 'CRITICAL',
      priority: 1,
      enabled: true,
      evaluate: async (content) => {
        return {
          decision: 'BLOCK',
          reason: 'Harmful query input blocked',
          policyId: 'block-1'
        };
      }
    };

    registry.register(blockPolicy);

    try {
      await runtime.evaluate('PRE_PROVIDER', 'Violating prompt', {});
      assert.fail('Should have thrown PolicyError on BLOCK decision');
    } catch (err: any) {
      assert.strictEqual(err.name, 'PolicyError');
      assert.strictEqual(err.policyId, 'block-1');
      assert.strictEqual(err.reason, 'Harmful query input blocked');
      assert.strictEqual(err.severity, 'CRITICAL');
      assert.strictEqual(err.stage, 'PRE_PROVIDER');

      // Test toJSON serialization
      const json = err.toJSON();
      assert.strictEqual(json.name, 'PolicyError');
      assert.strictEqual(json.policyId, 'block-1');
      assert.strictEqual(json.severity, 'CRITICAL');
    }

    featureFlags.POLICY_RUNTIME = false;
  });

  await t.test('5. Try-catch fail-open behavior', async () => {
    featureFlags.POLICY_RUNTIME = true;
    registry.clear();

    const buggyPolicy: Policy = {
      id: 'buggy-1',
      version: '1.0.0',
      stage: 'PRE_PROVIDER',
      severity: 'HIGH',
      priority: 1,
      enabled: true,
      evaluate: async () => {
        throw new Error('Database connection timeout in policy engine');
      }
    };

    registry.register(buggyPolicy);

    // Should NOT throw because of fail-open guarantees
    const report = await runtime.evaluate('PRE_PROVIDER', 'Prompt topic', {});
    assert.strictEqual(report.passed, true);
    assert.strictEqual(report.errors.length, 1);
    assert.strictEqual(report.errors[0].policyId, 'buggy-1');
    assert.strictEqual(report.errors[0].error, 'Database connection timeout in policy engine');

    featureFlags.POLICY_RUNTIME = false;
  });

  await t.test('6. Feature flags defaults', () => {
    assert.strictEqual(featureFlags.POLICY_RUNTIME, false);
    assert.strictEqual(featureFlags.INPUT_GUARDRAILS, false);
    assert.strictEqual(featureFlags.OUTPUT_GUARDRAILS, false);
  });

});
