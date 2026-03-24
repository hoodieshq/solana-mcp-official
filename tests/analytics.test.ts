import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
const mockInsert = vi.fn().mockReturnValue({ then: vi.fn(cb => cb({ error: null })) });
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({ from: mockFrom })),
}));

// Mock inkeep analytics
const mockLog = vi.fn().mockResolvedValue({});
vi.mock('@inkeep/inkeep-analytics', () => ({
    InkeepAnalytics: vi.fn(() => ({ conversations: { log: mockLog } })),
}));

describe('logAnalytics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    describe('when both analytics disabled', () => {
        it('does not call supabase or inkeep', async () => {
            vi.stubEnv('SUPABASE_ANALYTICS_ENABLED', 'false');
            vi.stubEnv('INKEEP_ANALYTICS_ENABLED', 'false');
            const { logAnalytics } = await import('../lib/analytics.js');

            await logAnalytics({
                event_type: 'message_response',
                details: { tool: 'test', req: 'question', res: '{"content":[]}' },
            });

            expect(mockFrom).not.toHaveBeenCalled();
            expect(mockLog).not.toHaveBeenCalled();
        });
    });

    describe('when supabase enabled but inkeep disabled', () => {
        it('writes to supabase but skips inkeep', async () => {
            vi.stubEnv('SUPABASE_ANALYTICS_ENABLED', 'true');
            vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
            vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key');
            vi.stubEnv('INKEEP_ANALYTICS_ENABLED', 'false');
            const { logAnalytics } = await import('../lib/analytics.js');

            await logAnalytics({
                event_type: 'message_response',
                details: { tool: 'test', req: 'question', res: '{"content":[]}' },
            });

            expect(mockFrom).toHaveBeenCalledWith('tool_calls');
            expect(mockLog).not.toHaveBeenCalled();
        });
    });

    describe('when supabase enabled but credentials missing', () => {
        it('does not throw and supabase client is null', async () => {
            vi.stubEnv('SUPABASE_ANALYTICS_ENABLED', 'true');
            // No SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY
            const { logAnalytics } = await import('../lib/analytics.js');

            await expect(
                logAnalytics({
                    event_type: 'message_received',
                    details: { body: '{"method":"initialize","params":{}}' },
                }),
            ).resolves.not.toThrow();

            expect(mockFrom).not.toHaveBeenCalled();
        });
    });

    describe('JSON.parse safety', () => {
        // TODO: Current behavior need to be fixed
        it('does not throw when res is not valid JSON', async () => {
            vi.stubEnv('INKEEP_ANALYTICS_ENABLED', 'true');
            vi.stubEnv('INKEEP_API_KEY', 'test-key');
            vi.stubEnv('SUPABASE_ANALYTICS_ENABLED', 'false');
            const { logAnalytics } = await import('../lib/analytics.js');

            await expect(
                logAnalytics({
                    event_type: 'message_response',
                    details: { tool: 'test', req: 'q', res: 'not json' },
                }),
            ).resolves.not.toThrow();

            expect(mockLog).not.toHaveBeenCalled();
        });
    });

    describe('Inkeep receives meaningful assistant content', () => {
        // it('BUG: plain-text res (as all callers send) results in empty assistant content', async () => {
        //     vi.stubEnv('INKEEP_ANALYTICS_ENABLED', 'true');
        //     vi.stubEnv('INKEEP_API_KEY', 'test-key');
        //     vi.stubEnv('SUPABASE_ANALYTICS_ENABLED', 'false');
        //     const { logAnalytics } = await import('../lib/analytics.js');

        //     // This is what generateText() actually returns — plain text, not JSON
        //     const plainTextResponse = 'Solana uses Proof of History combined with Proof of Stake...';

        //     await logAnalytics({
        //         event_type: 'message_response',
        //         details: {
        //             tool: 'Solana_Expert__Ask_For_Help',
        //             req: 'How does Solana consensus work?',
        //             res: plainTextResponse,
        //         },
        //     });

        //     expect(mockLog).toHaveBeenCalled();

        //     // Extract the messages payload sent to Inkeep
        //     const logCall = mockLog.mock.calls[0];
        //     const conversation = logCall[1]; // second arg is CreateOpenAIConversation
        //     const assistantMsg = conversation.messages.find((m: any) => m.role === 'assistant');

        //     // BUG: assistant content is empty because JSON.parse(plainTextResponse)
        //     // throws and the empty catch block leaves links = ''
        //     expect(assistantMsg.content).toBe('');

        //     // This is what we WANT — the actual response should reach Inkeep:
        //     // expect(assistantMsg.content).toBe(plainTextResponse);
        // });

        it('JSON res with URLs extracts links correctly', async () => {
            vi.stubEnv('INKEEP_ANALYTICS_ENABLED', 'true');
            vi.stubEnv('INKEEP_API_KEY', 'test-key');
            vi.stubEnv('SUPABASE_ANALYTICS_ENABLED', 'false');
            const { logAnalytics } = await import('../lib/analytics.js');

            // This is the format the link-extraction code expects — but no caller sends it
            const jsonResponse = JSON.stringify({
                content: [
                    { type: 'text', text: 'Here are the docs' },
                    { url: 'https://solana.com/docs', title: 'Solana Docs' },
                    { url: 'https://anchor-lang.com', title: 'Anchor' },
                ],
            });

            await logAnalytics({
                event_type: 'message_response',
                details: { tool: 'test', req: 'query', res: jsonResponse },
            });

            const logCall = mockLog.mock.calls[0];
            const conversation = logCall[1];
            const assistantMsg = conversation.messages.find((m: any) => m.role === 'assistant');

            // Link extraction works when res IS the expected JSON format
            expect(assistantMsg.content).toBe(
                '- [Solana Docs](https://solana.com/docs)\n- [Anchor](https://anchor-lang.com)',
            );
        });
    });
});
