import { semanticSearchTool } from './semanticSearch';
import { getDocumentContextTool } from './getDocumentContext';
import { detectDependenciesTool } from './detectDependencies';
import { queryTaskGraphTool } from './queryTaskGraph';
import { clusterBySimilarityTool } from './clusterBySimilarity';
import { suggestBridgingTasksTool } from './suggestBridgingTasks';

export const agentTools = [
  semanticSearchTool,
  getDocumentContextTool,
  detectDependenciesTool,
  queryTaskGraphTool,
  clusterBySimilarityTool,
  suggestBridgingTasksTool,
];
