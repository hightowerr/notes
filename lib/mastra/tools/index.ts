import { semanticSearchTool } from './semanticSearch';
import { getDocumentContextTool } from './getDocumentContext';
import { detectDependenciesTool } from './detectDependencies';
import { queryTaskGraphTool } from './queryTaskGraph';
import { clusterBySimilarityTool } from './clusterBySimilarity';

export const agentTools = [
  semanticSearchTool,
  getDocumentContextTool,
  detectDependenciesTool,
  queryTaskGraphTool,
  clusterBySimilarityTool,
];
