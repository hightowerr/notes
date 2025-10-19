// lib/mastra/init.ts
import { mastra } from './config';
import { agentTools } from './tools';

// Register all tools with Mastra
export function initializeMastra() {
  agentTools.forEach(tool => {
    mastra.registerTool(tool);
  });

  console.log(`[Mastra] Initialized with ${agentTools.length} tools`);
  return mastra;
}

// Auto-initialize on import (server-side only)
if (typeof window === 'undefined') {
  initializeMastra();
}
