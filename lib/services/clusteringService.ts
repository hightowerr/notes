import { supabase } from '@/lib/supabase';
import { ClusteringResult, TaskCluster } from '@/lib/types/mastra';
import { agnes } from 'ml-hclust';

function cosineDistance(a: number[], b: number[]): number {
  const validLength = Math.min(Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0);
  if (validLength === 0) {
    return 1;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < validLength; i++) {
    const valueA = a[i];
    const valueB = b[i];

    if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
      continue;
    }

    dotProduct += valueA * valueB;
    magnitudeA += valueA * valueA;
    magnitudeB += valueB * valueB;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 1;
  }

  return 1 - dotProduct / Math.sqrt(magnitudeA * magnitudeB);
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
    return {
      clusters: [],
      task_count: 0,
      cluster_count: 0,
      threshold_used: options.threshold,
      ungrouped_task_ids: [],
    };
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
      ungrouped_task_ids: [],
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

  const taskClusters: TaskCluster[] = clusters
    .map((cluster, i) => {
      const clusterIndices = getClusterIndices(cluster);
      const clusterTaskIds = clusterIndices
        .map(index => embeddings[index]?.task_id)
        .filter((taskId): taskId is string => typeof taskId === 'string' && taskId.length > 0);
      const clusterEmbeddings = clusterIndices
        .map(index => embeddings[index]?.embedding)
        .filter((embedding): embedding is number[] => Array.isArray(embedding) && embedding.length > 0);

      if (clusterTaskIds.length === 0 || clusterEmbeddings.length === 0) {
        console.warn('[ClusteringService] Skipping empty cluster produced by agnes cut.', {
          cluster_id: i,
          clusterIndices,
        });
        return null;
      }

      const baseEmbedding = clusterEmbeddings[0] ?? [];
      const centroid =
        baseEmbedding.length > 0
          ? baseEmbedding.map((_, dim) => {
              const sum = clusterEmbeddings.reduce((acc, embedding) => {
                const value = embedding[dim];
                return Number.isFinite(value) ? acc + value : acc;
              }, 0);
              return sum / clusterEmbeddings.length;
            })
          : [];

      let totalSimilarity = 0;
      let pairs = 0;
      for (let source = 0; source < clusterEmbeddings.length; source++) {
        for (let target = source + 1; target < clusterEmbeddings.length; target++) {
          totalSimilarity += 1 - cosineDistance(clusterEmbeddings[source], clusterEmbeddings[target]);
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
    })
    .filter((cluster): cluster is TaskCluster => cluster !== null);

  const usefulClusters: TaskCluster[] = [];
  const assignedTaskIds = new Set<string>();

  for (const cluster of taskClusters) {
    const isMultiTask = cluster.task_ids.length > 1;
    const meetsSimilarity = cluster.average_similarity >= options.threshold;

    if (isMultiTask && meetsSimilarity) {
      usefulClusters.push(cluster);
      cluster.task_ids.forEach(taskId => assignedTaskIds.add(taskId));
    } else {
      console.log('[ClusteringService] Discarding low-value cluster.', {
        cluster_id: cluster.cluster_id,
        size: cluster.task_ids.length,
        average_similarity: cluster.average_similarity,
        meetsSimilarity,
      });
    }
  }

  if (usefulClusters.length === 0) {
    const fallbackCluster = taskClusters
      .filter(cluster => cluster.task_ids.length > 1)
      .sort((a, b) => b.average_similarity - a.average_similarity)[0];

    if (fallbackCluster) {
      console.log('[ClusteringService] Falling back to best available cluster.', {
        cluster_id: fallbackCluster.cluster_id,
        size: fallbackCluster.task_ids.length,
        average_similarity: fallbackCluster.average_similarity,
      });
      usefulClusters.push(fallbackCluster);
      fallbackCluster.task_ids.forEach(taskId => assignedTaskIds.add(taskId));
    }
  }

  const ungroupedTaskIds = task_ids.filter(taskId => !assignedTaskIds.has(taskId));
  console.log('[ClusteringService] Ungrouped task IDs:', ungroupedTaskIds);

  const sortedClusters = usefulClusters.sort(
    (a, b) => b.task_ids.length - a.task_ids.length || b.average_similarity - a.average_similarity
  );

  return {
    clusters: sortedClusters,
    task_count: task_ids.length,
    cluster_count: sortedClusters.length,
    threshold_used: options.threshold,
    ungrouped_task_ids: ungroupedTaskIds,
  };
}
