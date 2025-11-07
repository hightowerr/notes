import type { BridgingTask } from '@/lib/schemas/bridgingTaskSchema';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';

export type GapContextForPlan = {
  predecessor_task_id: string;
  successor_task_id: string;
};

export type AcceptedSuggestionForPlan = {
  task: BridgingTask;
  gap: GapContextForPlan;
  finalText: string;
  finalHours: number;
};

/**
 * Integrate accepted bridging tasks into a prioritized plan. The original plan object
 * is not mutated; a new deep-cloned plan is returned with ordering, dependencies,
 * execution waves, confidence scores, and annotations updated to reflect the new work.
 */
export function integrateAcceptedTasksIntoPlan(
  plan: PrioritizedTaskPlan,
  accepted: AcceptedSuggestionForPlan[]
): PrioritizedTaskPlan {
  if (accepted.length === 0) {
    return plan;
  }

  const nextPlan: PrioritizedTaskPlan = JSON.parse(JSON.stringify(plan));

  const seenOrder = new Set<string>();
  accepted.forEach(entry => {
    const { task, gap } = entry;
    const newTaskId = task.id;
    const predecessorIndex = nextPlan.ordered_task_ids.indexOf(gap.predecessor_task_id);
    const successorIndex = nextPlan.ordered_task_ids.indexOf(gap.successor_task_id);
    let insertIndex = successorIndex;

    if (insertIndex === -1 && predecessorIndex !== -1) {
      insertIndex = predecessorIndex + 1;
    }
    if (insertIndex === -1) {
      insertIndex = nextPlan.ordered_task_ids.length;
    }

    nextPlan.ordered_task_ids.splice(insertIndex, 0, newTaskId);
    seenOrder.add(newTaskId);
  });

  // Ensure ordered_task_ids remains unique while preserving new ordering
  const dedupedOrder: string[] = [];
  const encountered = new Set<string>();
  nextPlan.ordered_task_ids.forEach(id => {
    if (!encountered.has(id)) {
      dedupedOrder.push(id);
      encountered.add(id);
    }
  });
  nextPlan.ordered_task_ids = dedupedOrder;

  nextPlan.dependencies ??= [];
  accepted.forEach(entry => {
    const { task, gap } = entry;
    const dependencyCandidates = [
      { source: gap.predecessor_task_id, target: task.id },
      { source: task.id, target: gap.successor_task_id },
    ];

    dependencyCandidates.forEach(({ source, target }) => {
      const alreadyExists = nextPlan.dependencies.some(
        dependency =>
          dependency.source_task_id === source && dependency.target_task_id === target
      );
      if (!alreadyExists) {
        nextPlan.dependencies.push({
          source_task_id: source,
          target_task_id: target,
          relationship_type: 'prerequisite',
          confidence: task.confidence,
          detection_method: 'stored_relationship',
        });
      }
    });
  });

  nextPlan.confidence_scores ??= {};
  accepted.forEach(entry => {
    nextPlan.confidence_scores[entry.task.id] = entry.task.confidence;
  });

  nextPlan.execution_waves ??= [];
  if (nextPlan.execution_waves.length === 0) {
    nextPlan.execution_waves.push({
      wave_number: 1,
      task_ids: [],
      parallel_execution: false,
      estimated_duration_hours: null,
    });
  }

  accepted.forEach(entry => {
    const { task, gap } = entry;
    const targetWaveIndex = nextPlan.execution_waves.findIndex(wave =>
      wave.task_ids.includes(gap.successor_task_id)
    );
    if (targetWaveIndex !== -1) {
      const targetWave = nextPlan.execution_waves[targetWaveIndex];
      const successorPosition = targetWave.task_ids.indexOf(gap.successor_task_id);
      const insertionIndex =
        successorPosition === -1 ? targetWave.task_ids.length : successorPosition;
      targetWave.task_ids.splice(insertionIndex, 0, task.id);
    } else {
      const lastWave = nextPlan.execution_waves[nextPlan.execution_waves.length - 1];
      if (!lastWave.task_ids.includes(task.id)) {
        lastWave.task_ids.push(task.id);
      }
    }
  });

  nextPlan.task_annotations ??= [];
  accepted.forEach(entry => {
    const annotationExists = nextPlan.task_annotations?.some(
      annotation => annotation.task_id === entry.task.id
    );
    if (!annotationExists) {
      nextPlan.task_annotations?.push({
        task_id: entry.task.id,
        state: 'manual_override',
        reasoning: entry.task.reasoning,
        dependency_notes: `Estimated effort: ${entry.finalHours} hours`,
        manual_override: true,
      });
    }
  });

  return nextPlan;
}
