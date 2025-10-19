export type DocumentContext = {
  document_id: string;
  filename: string;
  markdown_content: string;
  tasks_in_document: {
    task_id: string;
    task_text: string;
  }[];
  pagination_metadata: PaginationMetadata | null;
};

export type PaginationMetadata = {
  current_chunk: number;
  total_chunks: number;
  chunk_size: number;
  overlap_size: number;
};

export type DependencyAnalysisResult = {
  dependencies: TaskDependency[];
  analyzed_count: number;
  context_included: boolean;
};

export type TaskDependency = {
  source_task_id: string;
  target_task_id: string;
  relationship_type: 'prerequisite' | 'blocks' | 'related';
  confidence_score: number;
  reasoning: string;
};

export type ClusteringResult = {
  clusters: TaskCluster[];
  task_count: number;
  cluster_count: number;
  threshold_used: number;
};

export type TaskCluster = {
  cluster_id: number;
  task_ids: string[];
  centroid: number[];
  average_similarity: number;
};
