  import dotenv from 'dotenv';
  import { semanticSearchTool } from '@/lib/mastra/tools/semanticSearch';

  dotenv.config({ path: '.env.local' });

  async function main() {
    const payload = {
      query: 'increase app monthly revenue',
      limit: 20,
      threshold: 0.1,
    };

    const start = Date.now();
    const result = await semanticSearchTool.execute(payload);
    const duration = Date.now() - start;

    console.log(JSON.stringify(result, null, 2));
    console.log(`Execution time: ${duration} ms`);
  }

  main().catch((err) => {
    console.error('Semantic search failed:', err);
    process.exitCode = 1;
  });