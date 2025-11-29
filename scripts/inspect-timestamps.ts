
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Checking timestamp formats...');

    const { data: files } = await supabase
        .from('uploaded_files')
        .select('uploaded_at')
        .limit(1);

    if (files && files.length > 0) {
        console.log('uploaded_files.uploaded_at:', files[0].uploaded_at);
    } else {
        console.log('No uploaded files found.');
    }

    const { data: sessions } = await supabase
        .from('agent_sessions')
        .select('created_at')
        .limit(1);

    if (sessions && sessions.length > 0) {
        console.log('agent_sessions.created_at:', sessions[0].created_at);
    } else {
        console.log('No agent sessions found.');
    }
}

main();
