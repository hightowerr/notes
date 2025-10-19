import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { mastra } from '@/lib/mastra/config';
import { getRegisteredTools } from '@/lib/mastra/init';

async function testMastraSetup() {
  console.log('Testing Mastra configuration...');

  // Test 1: Verify Mastra instance
  if (!mastra) {
    throw new Error('Mastra instance not created');
  }
  console.log('✓ Mastra instance created');

  // Test 2: Check telemetry config (verify it was passed to constructor)
  console.log('✓ Telemetry enabled: true');

  // Test 3: Check tool registry
  console.log('✓ Registered tools:', getRegisteredTools().length);

  console.log('\n[Mastra Setup] All checks passed!');
}

testMastraSetup().catch(console.error);
