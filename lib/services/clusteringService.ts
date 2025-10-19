import { supabase } from '@/lib/supabase';
import { ClusteringResult, TaskCluster } from '@/lib/types/mastra';
import { agnes } from 'ml-hclust';

function cosineDistance(a: number[], b: number[]): number {
  const dotProduct = a.reduce((acc, val, i) => acc + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((acc, val) => acc + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((acc, val) => acc + val * val, 0));
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 1; // Or handle as an error
  }
  return 1 - dotProduct / (magnitudeA * magnitudeB);
}

function getClusterIndices(cluster: any): number[] {
  if (cluster.isLeaf) {
    return [cluster.index];
  }
  return cluster.children.flatMap(getClusterIndices);
}

export async function performHierarchicalClustering(
  task_ids: string[],
  options: { threshold: number }
): Promise<ClusteringResult> {
  if (task_ids.length === 0) {
    return { clusters: [], task_count: 0, cluster_count: 0, threshold_used: options.threshold };
  }

  if (task_ids.length === 1) {
    const { data: task, error } = await supabase
      .from('task_embeddings')
      .select('task_id, embedding')
      .eq('task_id', task_ids[0])
      .single();

    if (error || !task) {
      throw new Error('Failed to fetch single task embedding');
    }

    return {
      clusters: [
        {
          cluster_id: 0,
          task_ids: [task.task_id],
          centroid: task.embedding,
          average_similarity: 1.0,
        },
      ],
      task_count: 1,
      cluster_count: 1,
      threshold_used: options.threshold,
    };
  }

  const { data: embeddings, error } = await supabase
    .from('task_embeddings')
    .select('task_id, embedding')
    .in('task_id', task_ids);

  if (error) {
    throw new Error(`Failed to fetch embeddings: ${error.message}`);
  }

  if (!embeddings || embeddings.length === 0) {
    throw new Error('Insufficient embeddings for clustering');
  }

  if (embeddings.length !== task_ids.length) {
    throw new Error('Missing embeddings for one or more task IDs');
  }

  if (embeddings.length < 2) {
    throw new Error('Insufficient embeddings for clustering');
  }

  const tree = agnes(embeddings.map((e) => e.embedding), {
    distanceFunction: cosineDistance,
    method: 'complete',
  });

  const clusters = tree.cut(options.threshold);

  const taskClusters: TaskCluster[] = clusters.map((cluster, i) => {
    const clusterIndices = getClusterIndices(cluster);
    const clusterTaskIds = clusterIndices.map(index => embeddings[index].task_id);
    const clusterEmbeddings = clusterIndices.map(index => embeddings[index].embedding);

    const centroid = clusterEmbeddings[0].map(
      (_, dim) =>
        clusterEmbeddings.reduce((sum, emb) => sum + emb[dim], 0) /
        clusterEmbeddings.length
    );

    let totalSimilarity = 0;
    let pairs = 0;
    for (let i = 0; i < clusterEmbeddings.length; i++) {
      for (let j = i + 1; j < clusterEmbeddings.length; j++) {
        totalSimilarity += 1 - cosineDistance(clusterEmbeddings[i], clusterEmbeddings[j]);
        pairs++;
      }
    }
    const average_similarity = pairs > 0 ? totalSimilarity / pairs : 1.0;

    return {
      cluster_id: i,
      task_ids: clusterTaskIds,
      centroid,
      average_similarity,
    };
  });

  return {
    clusters: taskClusters.sort((a, b) => b.task_ids.length - a.task_ids.length),
    task_count: task_ids.length,
    cluster_count: taskClusters.length,
    threshold_used: options.threshold,
  };
}
