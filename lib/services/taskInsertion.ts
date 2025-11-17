/**
 * Task Insertion Service
 *
 * Implements task insertion with dependency validation using Kahn's algorithm
 * for cycle detection. Ensures DAG integrity when inserting AI-generated
 * bridging tasks into the prioritized task plan.
 *
 * @see research.md - Kahn's algorithm topological sort approach
 * @see data-model.md - BridgingTask entity and insertion logic
 */

export interface Task {
  id: string;
  text: string;
  estimated_hours: number;
  depends_on: string[];
}

export interface BridgingTaskInput {
  text: string;
  estimated_hours: number;
}

export interface Gap {
  predecessor_id: string;
  successor_id: string;
}

export interface InsertionResult {
  success: boolean;
  insertedIds: string[];
  error: string | null;
  updated_plan?: Task[];
}

/**
 * Detects circular dependencies in a task graph using Kahn's algorithm
 * (topological sort with in-degree counting).
 *
 * Time complexity: O(V + E) where V = tasks, E = dependencies
 *
 * @param tasks - Array of tasks with dependencies
 * @returns true if cycle detected, false if DAG is valid
 */
export function detectCycle(tasks: Task[]): boolean {
  if (tasks.length === 0) {
    return false;
  }

  // Build adjacency list and calculate in-degrees
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // Initialize graph
  tasks.forEach(task => {
    inDegree.set(task.id, 0);
    adjList.set(task.id, []);
  });

  // Build edges and calculate in-degrees
  tasks.forEach(task => {
    task.depends_on.forEach(depId => {
      // Only add edge if dependency exists in task list
      if (adjList.has(depId)) {
        adjList.get(depId)!.push(task.id);
        inDegree.set(task.id, inDegree.get(task.id)! + 1);
      }
    });
  });

  // Kahn's algorithm: Process tasks with zero in-degree
  const queue: string[] = [];
  inDegree.forEach((degree, taskId) => {
    if (degree === 0) {
      queue.push(taskId);
    }
  });

  let processedCount = 0;

  while (queue.length > 0) {
    const taskId = queue.shift()!;
    processedCount++;

    // Reduce in-degree for all neighbors
    adjList.get(taskId)!.forEach(neighborId => {
      const newDegree = inDegree.get(neighborId)! - 1;
      inDegree.set(neighborId, newDegree);

      if (newDegree === 0) {
        queue.push(neighborId);
      }
    });
  }

  // Cycle exists if we couldn't process all tasks
  return processedCount !== tasks.length;
}

/**
 * Calculate next available task ID based on predecessor and successor IDs.
 *
 * @param predecessorId - ID of task before gap (e.g., "002"), or "000" for start
 * @param successorId - ID of task after gap (e.g., "005")
 * @param count - Number of tasks to insert
 * @param existingPlan - Current task plan to avoid ID collisions
 * @returns Array of sequential IDs (e.g., ["003", "004"])
 */
function calculateTaskIds(
  predecessorId: string,
  successorId: string,
  count: number,
  existingPlan: Task[]
): string[] {
  const ids: string[] = [];

  // Special case: Insert at start (predecessor_id = "000")
  if (predecessorId === '000') {
    const successorNum = parseInt(successorId, 10);
    // Generate IDs before successor: if successor is 001, generate 000; if 003, generate 001, 002
    for (let i = count; i >= 1; i--) {
      const newId = String(successorNum - i).padStart(3, '0');
      ids.push(newId);
    }
    return ids.reverse();
  }

  // Normal case: Extract numeric part and pad to 3 digits
  const predecessorNum = parseInt(predecessorId, 10);

  for (let i = 1; i <= count; i++) {
    const newId = String(predecessorNum + i).padStart(3, '0');
    ids.push(newId);
  }

  return ids;
}

/**
 * Validates bridging task input data.
 *
 * @param task - Bridging task to validate
 * @returns Error message if invalid, null if valid
 */
function validateBridgingTask(task: BridgingTaskInput): string | null {
  if (!task.text || task.text.trim().length === 0) {
    return 'Task text cannot be empty';
  }

  if (task.estimated_hours <= 0) {
    return 'Task estimated_hours must be positive';
  }

  if (task.estimated_hours < 8 || task.estimated_hours > 160) {
    return 'Task estimated_hours must be between 8 and 160 hours';
  }

  return null;
}

/**
 * Inserts bridging tasks between predecessor and successor tasks.
 *
 * Creates a dependency chain: predecessor → task1 → task2 → ... → successor
 * Validates the resulting graph for circular dependencies using Kahn's algorithm.
 *
 * @param gap - Gap context with predecessor and successor IDs
 * @param bridgingTasks - Tasks to insert (1-3 typically)
 * @param currentPlan - Existing task plan
 * @returns Insertion result with success status and updated plan
 */
export function insertBridgingTasks(
  gap: Gap,
  bridgingTasks: BridgingTaskInput[],
  currentPlan: Task[]
): InsertionResult {
  // Validate inputs
  if (bridgingTasks.length === 0) {
    return {
      success: true,
      insertedIds: [],
      error: null,
      updated_plan: currentPlan,
    };
  }

  // Validate each bridging task
  for (const task of bridgingTasks) {
    const validationError = validateBridgingTask(task);
    if (validationError) {
      return {
        success: false,
        insertedIds: [],
        error: validationError,
      };
    }
  }

  // Check if predecessor exists (special case: "000" means insert at start)
  const predecessorExists =
    gap.predecessor_id === '000' ||
    currentPlan.some(t => t.id === gap.predecessor_id);

  if (!predecessorExists) {
    return {
      success: false,
      insertedIds: [],
      error: `predecessor task ${gap.predecessor_id} not found in plan`,
    };
  }

  // Check if successor exists
  const successorExists = currentPlan.some(t => t.id === gap.successor_id);
  if (!successorExists) {
    return {
      success: false,
      insertedIds: [],
      error: `successor task ${gap.successor_id} not found in plan`,
    };
  }

  // Calculate new task IDs
  const newTaskIds = calculateTaskIds(
    gap.predecessor_id,
    gap.successor_id,
    bridgingTasks.length,
    currentPlan
  );

  // Create new tasks with dependency chain
  const newTasks: Task[] = bridgingTasks.map((bt, index) => {
    let depends_on: string[];

    if (index === 0) {
      // First task depends on predecessor
      depends_on = gap.predecessor_id === '000' ? [] : [gap.predecessor_id];
    } else {
      // Subsequent tasks depend on previous inserted task
      depends_on = [newTaskIds[index - 1]];
    }

    return {
      id: newTaskIds[index],
      text: bt.text,
      estimated_hours: bt.estimated_hours,
      depends_on,
    };
  });

  // Stage updates on a deep copy so currentPlan never mutates on failure
  const updatedPlan = currentPlan.map(task => ({
    ...task,
    depends_on: [...task.depends_on],
  }));

  // Find insertion index (after predecessor)
  let insertionIndex: number;
  if (gap.predecessor_id === '000') {
    insertionIndex = 0;
  } else {
    const predecessorIndex = updatedPlan.findIndex(
      t => t.id === gap.predecessor_id
    );
    insertionIndex = predecessorIndex + 1;
  }

  // Insert new tasks
  updatedPlan.splice(insertionIndex, 0, ...newTasks);

  // Update successor's dependencies
  const successorTask = updatedPlan.find(t => t.id === gap.successor_id);
  if (successorTask) {
    // Replace predecessor dependency with last inserted task
    if (gap.predecessor_id === '000') {
      // Insert at start: successor now depends on last inserted task
      const lastInsertedId = newTaskIds[newTaskIds.length - 1];
      if (!successorTask.depends_on.includes(lastInsertedId)) {
        successorTask.depends_on = [
          lastInsertedId,
          ...successorTask.depends_on,
        ];
      }
    } else {
      // Normal case: replace predecessor with last inserted task
      const predecessorDependencyIndex = successorTask.depends_on.indexOf(
        gap.predecessor_id
      );

      if (predecessorDependencyIndex !== -1) {
        successorTask.depends_on[predecessorDependencyIndex] =
          newTaskIds[newTaskIds.length - 1];
      } else {
        // Successor didn't depend on predecessor (gap indicator), add dependency
        successorTask.depends_on.push(newTaskIds[newTaskIds.length - 1]);
      }
    }
  }

  // Validate no circular dependencies
  const hasCycle = detectCycle(updatedPlan);
  if (hasCycle) {
    return {
      success: false,
      insertedIds: [],
      error:
        'Cannot insert tasks - would create circular dependency chain. Please review your plan\'s dependencies.',
    };
  }

  // Success
  return {
    success: true,
    insertedIds: newTaskIds,
    error: null,
    updated_plan: updatedPlan,
  };
}
