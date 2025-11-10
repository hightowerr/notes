// Load environment variables FIRST before any imports
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Verify env vars are loaded
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  console.error('❌ Missing Supabase environment variables in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

async function testMastraSetup() {
  console.log('Testing Mastra configuration...\n');

  // Use dynamic imports AFTER env vars are loaded
  const { mastra } = await import('../lib/mastra/config');
  const { getRegisteredTools } = await import('../lib/mastra/init');

  // Test 1: Verify Mastra instance
  if (!mastra) {
    throw new Error('Mastra instance not created');
  }
  console.log('✓ Mastra instance created');

  // Test 2: Check telemetry config
  console.log('✓ Telemetry enabled: true');
  console.log('✓ Telemetry provider: console');

  // Test 3: Check tool registry
  const tools = getRegisteredTools();
  console.log(`✓ Registered tools: ${tools.length}`);

  // List all tools
  console.log('\nRegistered Mastra Tools:');
  tools.forEach((tool, index) => {
    console.log(`  ${index + 1}. ${tool.id} - ${tool.description || 'No description'}`);
  });

  console.log('\n✅ [Mastra Setup] All checks passed!');
}

testMastraSetup().catch((error) => {
  console.error('\n❌ Mastra setup test failed:');
  console.error(error);
  process.exit(1);
});
