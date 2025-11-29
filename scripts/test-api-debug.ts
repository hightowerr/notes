
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Fetching an outcome ID...');
    // Try to get an outcome ID from agent_sessions or user_outcomes
    const { data: session } = await supabase
        .from('agent_sessions')
        .select('outcome_id')
        .limit(1)
        .maybeSingle();

    let outcomeId = session?.outcome_id;

    if (!outcomeId) {
        console.log('No session found, trying user_outcomes...');
        const { data: outcome } = await supabase
            .from('user_outcomes')
            .select('id')
            .limit(1)
            .maybeSingle();
        outcomeId = outcome?.id;
    }

    if (!outcomeId) {
        console.error('No outcome ID found in DB. Cannot test API.');
        // Use a random UUID to test validation of non-existent data
        outcomeId = '00000000-0000-0000-0000-000000000000';
        console.log(`Using dummy UUID: ${outcomeId}`);
    } else {
        console.log(`Found outcome ID: ${outcomeId}`);
    }

    const url = `http://localhost:3000/api/documents/prioritization-status?outcome_id=${outcomeId}`;
    console.log(`Fetching ${url}...`);

    try {
        const response = await fetch(url);
        console.log(`Status: ${response.status} ${response.statusText}`);

        const text = await response.text();
        try {
            const json = JSON.parse(text);
            console.log('Response JSON:', JSON.stringify(json, null, 2));
        } catch {
            console.log('Response Text:', text);
        }
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

main();
