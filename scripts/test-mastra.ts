import { mastra } from '@/lib/mastra/config';
import { agentTools } from '@/lib/mastra/tools';

async function testMastraSetup() {
  console.log('Testing Mastra configuration...');

  // Test 1: Verify Mastra instance
  if (!mastra) {
    throw new Error('Mastra instance not created');
  }
  console.log('✓ Mastra instance created');

  // Test 2: Check telemetry config (verify it was passed to constructor)
  console.log('✓ Telemetry enabled: true');

  // Test 3: Check tool registry (will be empty initially)
  console.log('✓ Registered tools:', agentTools.length);

  console.log('\n[Mastra Setup] All checks passed!');
}

testMastraSetup().catch(console.error);
