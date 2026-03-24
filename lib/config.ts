export const config = {
    supabase: {
        url: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        analyticsEnabled: process.env.SUPABASE_ANALYTICS_ENABLED !== 'false',
    },
    inkeep: {
        apiKey: process.env.INKEEP_API_KEY,
        analyticsEnabled: process.env.INKEEP_ANALYTICS_ENABLED !== 'false',
    },
    openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY,
    },
    redis: {
        url: process.env.REDIS_URL,
    },
};
