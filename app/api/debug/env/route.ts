
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'no-secret-set';

    // Simple protection: require the CRON_SECRET or a specific debug key if you want
    // checking if auth header contains the secret to allow viewing
    const isAuthorized = authHeader === `Bearer ${cronSecret}`;

    // We will list critical keys and their STATUS (not value)
    const envCheck = {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'DEFINED' : 'MISSING',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'DEFINED' : 'MISSING',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'DEFINED' : 'MISSING',
        TINY_TOKEN: process.env.TINY_TOKEN ? 'DEFINED' : 'MISSING',
        CRON_SECRET: process.env.CRON_SECRET ? 'DEFINED' : 'MISSING',
        // Add other keys as needed
        VERCEL: process.env.VERCEL ? 'DEFINED' : 'MISSING',
        HOSTINGER_DEPLOY: 'TRUE'
    };

    return NextResponse.json({
        authorized: isAuthorized,
        env: envCheck,
        timestamp: new Date().toISOString()
    });
}
