import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('config', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        // Clear module cache so config re-reads process.env
        vi.resetModules();
    });

    it('analyticsEnabled defaults to true when env var is not set', async () => {
        const { config } = await import('../lib/config.js');
        expect(config.supabase.analyticsEnabled).toBe(true);
        expect(config.inkeep.analyticsEnabled).toBe(true);
    });

    it('analyticsEnabled is false when set to "false"', async () => {
        vi.stubEnv('SUPABASE_ANALYTICS_ENABLED', 'false');
        vi.stubEnv('INKEEP_ANALYTICS_ENABLED', 'false');
        const { config } = await import('../lib/config.js');
        expect(config.supabase.analyticsEnabled).toBe(false);
        expect(config.inkeep.analyticsEnabled).toBe(false);
    });

    it('analyticsEnabled is true for any value other than "false"', async () => {
        vi.stubEnv('SUPABASE_ANALYTICS_ENABLED', 'true');
        vi.stubEnv('INKEEP_ANALYTICS_ENABLED', '1');
        const { config } = await import('../lib/config.js');
        expect(config.supabase.analyticsEnabled).toBe(true);
        expect(config.inkeep.analyticsEnabled).toBe(true);
    });

    it('reads all env vars into correct config paths', async () => {
        vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
        vi.stubEnv('INKEEP_API_KEY', 'inkeep-key');
        vi.stubEnv('OPENROUTER_API_KEY', 'openrouter-key');
        vi.stubEnv('REDIS_URL', 'redis://localhost');
        const { config } = await import('../lib/config.js');
        expect(config.supabase.url).toBe('https://test.supabase.co');
        expect(config.supabase.serviceRoleKey).toBe('test-key');
        expect(config.inkeep.apiKey).toBe('inkeep-key');
        expect(config.openrouter.apiKey).toBe('openrouter-key');
        expect(config.redis.url).toBe('redis://localhost');
    });
});
