import { supabase } from '@/lib/supabase';
import { bridgingTaskSchema, type BridgingTask } from '@/lib/schemas/bridgingTaskSchema';
import { generateEmbedding } from '@/lib/services/embeddingService';
import { searchSimilarTasks } from '@/lib/services/vectorStorage';

type AcceptedTaskInput = {
  task: BridgingTask;
  predecessor_id: string;
  successor_id: string;
};

type TaskRecord = {
  task_id: string;
  document_id: string | null;
};

type RelationshipRecord = {
  source_task_id: string;
  target_task_id: string;
};

type NormalizedTask = {
  raw: BridgingTask;
  predecessorId: string;
  successorId: string;
  finalText: string;
  finalHours: number;
  embedding: number[];
  documentId: string;
};

export type TaskInsertionResult = {
  inserted_count: number;
  task_ids: string[];
  relationships_created: number;
  cycles_resolved?: number;
  removed_edges?: Array<{ source: string; target: string; reason: string }>;
};

export type TaskInsertionErrorCode =
  | 'VALIDATION_ERROR'
  | 'TASK_NOT_FOUND'
  | 'DUPLICATE_TASK'
  | 'CYCLE_DETECTED'
  | 'INSERTION_FAILED';

export class TaskInsertionError extends Error {
  constructor(
    message: string,
    public readonly code: TaskInsertionErrorCode,
    public readonly validationErrors?: string[]
  ) {
    super(message);
    this.name = 'TaskInsertionError';
  }
}

function validateAndNormalizeTasks(inputs: AcceptedTaskInput[]): NormalizedTask[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TaskInsertionError('No tasks provided for insertion', 'VALIDATION_ERROR');
  }

  return inputs.map(input => {
    const parsedTask = bridgingTaskSchema.parse(input.task);

    const predecessorId = input.predecessor_id?.trim();
    const successorId = input.successor_id?.trim();
    if (!predecessorId || !successorId) {
      throw new TaskInsertionError('Predecessor and successor IDs are required', 'VALIDATION_ERROR');
    }

    const finalText = (parsedTask.edited_task_text ?? parsedTask.task_text).trim();
    if (finalText.length < 10 || finalText.length > 500) {
      throw new TaskInsertionError(
        `Task ${parsedTask.id} has invalid description length`,
        'VALIDATION_ERROR',
        [`Task ${parsedTask.id} description must be between 10 and 500 characters`]
      );
    }

    const finalHours = parsedTask.edited_estimated_hours ?? parsedTask.estimated_hours;
    if (!Number.isInteger(finalHours) || finalHours < 8 || finalHours > 160) {
      throw new TaskInsertionError(
        `Task ${parsedTask.id} has invalid estimated hours`,
        'VALIDATION_ERROR',
        [`Task ${parsedTask.id} estimated hours must be an integer between 8 and 160`]
      );
    }

    return {
      raw: parsedTask,
      predecessorId,
      successorId,
      finalText,
      finalHours,
      embedding: [],
      documentId: '',
    };
  });
}

async function fetchTaskContext(taskIds: string[]): Promise<Map<string, TaskRecord>> {
  if (taskIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('task_embeddings')
    .select('task_id, document_id')
    .in('task_id', taskIds)
    .returns<TaskRecord[]>();

  if (error) {
    throw new TaskInsertionError(
      `Failed to load existing tasks: ${error.message}`,
      'INSERTION_FAILED'
    );
  }

  const map = new Map<string, TaskRecord>();
  for (const row of data ?? []) {
    if (row?.task_id) {
      map.set(row.task_id, row);
    }
  }
  return map;
}

async function ensureTaskIdsAvailable(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) {
    return;
  }

  const { data, error } = await supabase
    .from('task_embeddings')
    .select('task_id')
    .in('task_id', taskIds)
    .returns<Array<{ task_id: string }>>();

  if (error) {
    throw new TaskInsertionError(
      `Failed to verify task identifiers: ${error.message}`,
      'INSERTION_FAILED'
    );
  }

  const existing = data ?? [];
  if (existing.length > 0) {
    const duplicates = existing.map(row => row.task_id);
    throw new TaskInsertionError(
      `Task identifiers already exist: ${duplicates.join(', ')}`,
      'VALIDATION_ERROR',
      duplicates.map(id => `Task ID ${id} already exists in task_embeddings`)
    );
  }
}

async function ensureTasksExist(
  normalized: NormalizedTask[],
  contextMap: Map<string, TaskRecord>
) {
  const missing: string[] = [];
  normalized.forEach(task => {
    if (!contextMap.has(task.predecessorId)) {
      missing.push(task.predecessorId);
    }
    if (!contextMap.has(task.successorId)) {
      missing.push(task.successorId);
    }
  });

  if (missing.length > 0) {
    throw new TaskInsertionError(
      `Referenced tasks not found: ${Array.from(new Set(missing)).join(', ')}`,
      'TASK_NOT_FOUND'
    );
  }
}

async function generateEmbeddings(normalized: NormalizedTask[]): Promise<void> {
  await Promise.all(
    normalized.map(async task => {
      task.embedding = await generateEmbedding(task.finalText);
    })
  );
}

async function checkForDuplicates(normalized: NormalizedTask[]): Promise<void> {
  for (const task of normalized) {
    const results = await searchSimilarTasks(task.embedding, 0.9, 3);
    const duplicate = results
      .filter(result => result.task_id !== task.raw.id)
      .sort((a, b) => b.similarity - a.similarity)[0];
    if (duplicate) {
      throw new TaskInsertionError(
        'Duplicate task detected',
        'DUPLICATE_TASK',
        [
          `Task '${task.finalText}' duplicates existing task '${duplicate.task_text}' (similarity: ${duplicate.similarity.toFixed(2)})`,
        ]
      );
    }
  }
}

async function loadExistingRelationships(): Promise<RelationshipRecord[]> {
  const { data, error } = await supabase
    .from('task_relationships')
    .select('source_task_id, target_task_id')
    .returns<RelationshipRecord[]>();

  if (error) {
    throw new TaskInsertionError(
      `Failed to load task relationships: ${error.message}`,
      'INSERTION_FAILED'
    );
  }

  return data ?? [];
}

async function loadTaskTexts(taskIds: string[]): Promise<Map<string, string>> {
  if (taskIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('task_embeddings')
    .select('task_id, task_text')
    .in('task_id', taskIds);

  if (error) {
    console.warn('[TaskInsertion] Failed to load task texts for cycle display:', error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row?.task_id && row?.task_text) {
      map.set(row.task_id, row.task_text);
    }
  }
  return map;
}

function buildAdjacency(
  relationships: RelationshipRecord[],
  normalized: NormalizedTask[]
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  const registerEdge = (source: string, target: string) => {
    if (!adjacency.has(source)) {
      adjacency.set(source, new Set());
    }
    adjacency.get(source)!.add(target);
  };

  relationships.forEach(rel => {
    registerEdge(rel.source_task_id, rel.target_task_id);
  });

  normalized.forEach(task => {
    registerEdge(task.predecessorId, task.raw.id);
    registerEdge(task.raw.id, task.successorId);
  });

  return adjacency;
}

async function runCycleDetection(
  adjacency: Map<string, Set<string>>,
  normalized: NormalizedTask[]
): Promise<void> {
  const allNodes = new Set<string>();
  adjacency.forEach((targets, source) => {
    allNodes.add(source);
    targets.forEach(target => allNodes.add(target));
  });

  const inDegree = new Map<string, number>();
  allNodes.forEach(node => inDegree.set(node, 0));
  adjacency.forEach(targets => {
    targets.forEach(target => {
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    });
  });

  const queue: string[] = Array.from(allNodes).filter(node => (inDegree.get(node) ?? 0) === 0);
  const visited: string[] = [];

  const adjacencyList = new Map<string, string[]>();
  adjacency.forEach((targets, source) => {
    adjacencyList.set(source, Array.from(targets));
  });

  while (queue.length > 0) {
    const node = queue.shift()!;
    visited.push(node);
    const neighbours = adjacencyList.get(node) ?? [];
    neighbours.forEach(next => {
      const nextInDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextInDegree);
      if (nextInDegree === 0) {
        queue.push(next);
      }
    });
  }

  if (visited.length === allNodes.size) {
    return;
  }

  // Cycle detected – attempt to extract a cycle path for diagnostics
  const cycle = findCycle(adjacency);

  // Load human-readable task texts for all tasks in the cycle
  const taskTexts = await loadTaskTexts(cycle);

  // Build human-readable cycle path
  const cycleWithNames: string[] = [];
  for (const taskId of cycle) {
    // First check if it's a new bridging task
    const bridgingTask = normalized.find(t => t.raw.id === taskId);
    if (bridgingTask) {
      const truncated = bridgingTask.finalText.length > 50
        ? `${bridgingTask.finalText.substring(0, 47)}...`
        : bridgingTask.finalText;
      cycleWithNames.push(`"${truncated}"`);
    } else {
      // Try to get existing task text from database
      const taskText = taskTexts.get(taskId);
      if (taskText) {
        const truncated = taskText.length > 50
          ? `${taskText.substring(0, 47)}...`
          : taskText;
        cycleWithNames.push(`"${truncated}"`);
      } else {
        // Fallback to short ID if text not found
        cycleWithNames.push(`Task ${taskId.substring(0, 8)}`);
      }
    }
  }

  const cyclePath = cycleWithNames.join(' → ');

  throw new TaskInsertionError(
    'Cannot insert bridging task - would create circular dependency',
    'CYCLE_DETECTED',
    [
      `Detected cycle: ${cyclePath}`,
      'This means there is already a dependency path from the successor back to the predecessor.',
      'The system attempted to auto-fix by removing conflicting edges, but the cycle could not be resolved.',
      'Try selecting a different gap, or manually review and remove conflicting relationships in your task graph.'
    ]
  );
}

function findCycle(adjacency: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const parent = new Map<string, string>();

  const dfs = (node: string): string[] => {
    visited.add(node);
    stack.add(node);

    for (const neighbour of adjacency.get(node) ?? []) {
      if (!visited.has(neighbour)) {
        parent.set(neighbour, node);
        const result = dfs(neighbour);
        if (result.length > 0) {
          return result;
        }
      } else if (stack.has(neighbour)) {
        const path: string[] = [neighbour];
        let current = node;
        while (current !== neighbour) {
          path.push(current);
          const nextParent = parent.get(current);
          if (!nextParent) {
            break;
          }
          current = nextParent;
        }
        path.push(neighbour);
        return path.reverse();
      }
    }

    stack.delete(node);
    return [];
  };

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle.length > 0) {
        return cycle;
      }
    }
  }

  return [];
}

/**
 * Check if there's a path from source to target using BFS
 */
function findPath(
  relationships: RelationshipRecord[],
  source: string,
  target: string
): boolean {
  if (source === target) {
    return true;
  }

  const adjacency = new Map<string, Set<string>>();
  for (const rel of relationships) {
    if (!adjacency.has(rel.source_task_id)) {
      adjacency.set(rel.source_task_id, new Set());
    }
    adjacency.get(rel.source_task_id)!.add(rel.target_task_id);
  }

  const queue: string[] = [source];
  const visited = new Set<string>([source]);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === target) {
      return true;
    }

    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return false;
}

/**
 * Find all edges along the shortest path from source to target
 */
function findPathEdges(
  relationships: RelationshipRecord[],
  source: string,
  target: string
): RelationshipRecord[] {
  if (source === target) {
    return [];
  }

  const adjacency = new Map<string, Set<string>>();
  for (const rel of relationships) {
    if (!adjacency.has(rel.source_task_id)) {
      adjacency.set(rel.source_task_id, new Set());
    }
    adjacency.get(rel.source_task_id)!.add(rel.target_task_id);
  }

  // BFS to find shortest path
  const queue: Array<{ node: string; path: string[] }> = [{ node: source, path: [source] }];
  const visited = new Set<string>([source]);

  while (queue.length > 0) {
    const { node: current, path } = queue.shift()!;

    if (current === target) {
      // Reconstruct edges from path
      const edges: RelationshipRecord[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const from = path[i];
        const to = path[i + 1];
        const edge = relationships.find(
          rel => rel.source_task_id === from && rel.target_task_id === to
        );
        if (edge) {
          edges.push(edge);
        }
      }
      return edges;
    }

    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ node: neighbor, path: [...path, neighbor] });
      }
    }
  }

  return [];
}

async function insertTasks(normalized: NormalizedTask[]): Promise<string[]> {
  const rows = normalized.map(task => ({
    task_id: task.raw.id,
    task_text: task.finalText,
    document_id: task.documentId,
    embedding: task.embedding,
    status: 'completed',
    error_message: null,
  }));

  const { data, error } = await supabase
    .from('task_embeddings')
    .insert(rows)
    .select('task_id');

  if (error) {
    throw new TaskInsertionError(
      `Failed to insert bridging tasks: ${error.message}`,
      'INSERTION_FAILED'
    );
  }

  return (data ?? []).map(row => row.task_id);
}

async function insertRelationships(normalized: NormalizedTask[]) {
  const rows = normalized.flatMap(task => {
    const base = {
      relationship_type: 'prerequisite' as const,
      detection_method: 'ai' as const,
      confidence_score: Math.min(Math.max(task.raw.confidence, 0), 1),
      reasoning: task.raw.reasoning,
    };

    return [
      {
        source_task_id: task.predecessorId,
        target_task_id: task.raw.id,
        ...base,
      },
      {
        source_task_id: task.raw.id,
        target_task_id: task.successorId,
        ...base,
      },
    ];
  });

  const { error } = await supabase.from('task_relationships').insert(rows);
  if (error) {
    throw new TaskInsertionError(
      `Failed to create task relationships: ${error.message}`,
      'INSERTION_FAILED'
    );
  }
}

export async function insertBridgingTasks(
  inputs: AcceptedTaskInput[]
): Promise<TaskInsertionResult> {
  const startedAt = Date.now();
  const normalized = validateAndNormalizeTasks(inputs);

  const neighborMap = await fetchTaskContext(
    Array.from(
      new Set(
        normalized.flatMap(task => [task.predecessorId, task.successorId])
      )
    )
  );
  await ensureTasksExist(normalized, neighborMap);
  await ensureTaskIdsAvailable(normalized.map(task => task.raw.id));

  normalized.forEach(task => {
    const predecessorRecord = neighborMap.get(task.predecessorId);
    const successorRecord = neighborMap.get(task.successorId);
    const documentId = predecessorRecord?.document_id ?? successorRecord?.document_id;
    if (!documentId) {
      throw new TaskInsertionError(
        `Unable to resolve document context for task ${task.raw.id}`,
        'VALIDATION_ERROR'
      );
    }
    task.documentId = documentId;
  });

  await generateEmbeddings(normalized);
  await checkForDuplicates(normalized);

  let existingRelationships = await loadExistingRelationships();
  const removedEdges: Array<{ source: string; target: string; reason: string }> = [];

  // Check EACH bridging task individually for potential cycles
  for (const task of normalized) {
    // Check if there's an existing path from successor back to predecessor
    // This would create a cycle when we add: predecessor → bridging → successor
    const hasPathBack = findPath(
      existingRelationships,
      task.successorId,
      task.predecessorId
    );

    if (hasPathBack) {
      const taskTexts = await loadTaskTexts([task.predecessorId, task.successorId]);
      const predecessorText = taskTexts.get(task.predecessorId) ?? task.predecessorId.substring(0, 8);
      const successorText = taskTexts.get(task.successorId) ?? task.successorId.substring(0, 8);

      console.warn('[TaskInsertion] Pre-existing cycle detected', {
        predecessor: task.predecessorId.substring(0, 8),
        bridgingTask: task.raw.id.substring(0, 8),
        successor: task.successorId.substring(0, 8),
        pathExists: `${task.successorId.substring(0, 8)} → ... → ${task.predecessorId.substring(0, 8)}`,
      });

      // Strategy: Remove the DIRECT edge from successor → predecessor if it exists
      // This is the most likely cause of the immediate cycle
      const directEdge = existingRelationships.find(
        rel => rel.source_task_id === task.successorId && rel.target_task_id === task.predecessorId
      );

      if (directEdge) {
        console.log('[TaskInsertion] Removing direct back-edge to break cycle', {
          from: task.successorId.substring(0, 8),
          to: task.predecessorId.substring(0, 8),
        });

        const { error: deleteError } = await supabase
          .from('task_relationships')
          .delete()
          .eq('source_task_id', directEdge.source_task_id)
          .eq('target_task_id', directEdge.target_task_id);

        if (deleteError) {
          console.error('[TaskInsertion] Failed to remove direct back-edge', {
            error: deleteError.message,
          });
        } else {
          removedEdges.push({
            source: directEdge.source_task_id,
            target: directEdge.target_task_id,
            reason: `Removed to allow bridging task between "${predecessorText}" and "${successorText}"`,
          });

          // Remove from local array
          existingRelationships = existingRelationships.filter(
            rel => rel.source_task_id !== directEdge.source_task_id || rel.target_task_id !== directEdge.target_task_id
          );
        }
      } else {
        // No direct edge, but there's an indirect path - find and remove one edge in the path
        const pathEdges = findPathEdges(existingRelationships, task.successorId, task.predecessorId);

        if (pathEdges.length > 0) {
          // Remove the first edge in the path (closest to successor)
          const edgeToRemove = pathEdges[0];

          console.log('[TaskInsertion] Removing edge from indirect path to break cycle', {
            from: edgeToRemove.source_task_id.substring(0, 8),
            to: edgeToRemove.target_task_id.substring(0, 8),
            pathLength: pathEdges.length,
          });

          const { error: deleteError } = await supabase
            .from('task_relationships')
            .delete()
            .eq('source_task_id', edgeToRemove.source_task_id)
            .eq('target_task_id', edgeToRemove.target_task_id);

          if (deleteError) {
            console.error('[TaskInsertion] Failed to remove path edge', {
              error: deleteError.message,
            });
          } else {
            removedEdges.push({
              source: edgeToRemove.source_task_id,
              target: edgeToRemove.target_task_id,
              reason: `Removed to break indirect path between "${successorText}" and "${predecessorText}"`,
            });

            existingRelationships = existingRelationships.filter(
              rel => rel.source_task_id !== edgeToRemove.source_task_id || rel.target_task_id !== edgeToRemove.target_task_id
            );
          }
        }
      }
    }
  }

  // Final validation - ensure no cycle exists after cleanup
  const finalAdjacency = buildAdjacency(existingRelationships, normalized);
  await runCycleDetection(finalAdjacency, normalized);

  const insertedTaskIds = await insertTasks(normalized);

  try {
    await insertRelationships(normalized);
  } catch (error) {
    // Attempt rollback of inserted tasks to maintain integrity
    await supabase.from('task_embeddings').delete().in('task_id', insertedTaskIds);
    throw error;
  }

  const durationMs = Date.now() - startedAt;
  console.log('[TaskInsertion] Accepted bridging tasks', {
    accepted_count: normalized.length,
    inserted_count: insertedTaskIds.length,
    relationships_created: normalized.length * 2,
    cycles_resolved: removedEdges.length,
    duration_ms: durationMs,
  });

  const result: TaskInsertionResult = {
    inserted_count: insertedTaskIds.length,
    task_ids: insertedTaskIds,
    relationships_created: normalized.length * 2,
  };

  if (removedEdges.length > 0) {
    result.cycles_resolved = removedEdges.length;
    result.removed_edges = removedEdges;
  }

  return result;
}
