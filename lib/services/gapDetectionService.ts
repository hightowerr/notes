import { randomUUID } from 'node:crypto';

import { supabase } from '@/lib/supabase';
import type { GapDetectionResponse, Gap } from '@/lib/schemas/gapSchema';
import { getTaskRecordsByIds } from '@/lib/services/taskRepository';

type TaskRecord = {
  task_id: string;
  task_text: string;
  created_at: string | null;
};

type RelationshipRecord = {
  source_task_id: string;
  target_task_id: string;
  relationship_type: string;
};

export class MissingTaskError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'MissingTaskError';
  }
}

const WORKFLOW_STAGES = ['research', 'design', 'plan', 'build', 'test', 'deploy', 'launch'] as const;
type WorkflowStage = (typeof WORKFLOW_STAGES)[number] | 'unknown';

const WORKFLOW_KEYWORDS: Record<Exclude<WorkflowStage, 'unknown'>, string[]> = {
  research: ['research', 'analysis', 'investigate', 'discovery', 'interview'],
  design: ['design', 'mockup', 'wireframe', 'prototype', 'ux', 'ui'],
  plan: ['plan', 'roadmap', 'spec', 'backlog', 'groom', 'architecture'],
  build: ['build', 'implement', 'develop', 'code', 'create', 'engineer', 'integrate'],
  test: ['test', 'qa', 'validate', 'verify', 'quality', 'bug', 'regression'],
  deploy: ['deploy', 'release', 'ship', 'rollout', 'publish', 'handoff', 'handover'],
  launch: ['launch', 'go live', 'golive', 'announce', 'marketing push'],
};

const SKILL_KEYWORDS: Record<string, string[]> = {
  design: ['design', 'ux', 'ui', 'prototype', 'wireframe', 'figma'],
  frontend: ['frontend', 'react', 'next', 'typescript', 'javascript', 'ui component'],
  backend: ['backend', 'api', 'database', 'server', 'supabase', 'postgres', 'node'],
  data: ['analytics', 'data', 'metrics', 'sql', 'dashboard'],
  marketing: ['launch', 'campaign', 'marketing', 'go-to-market', 'growth', 'seo'],
  qa: ['test', 'qa', 'quality', 'bugs', 'regression', 'verify'],
  devops: ['deploy', 'pipeline', 'infrastructure', 'devops', 'ci', 'cd', 'kubernetes'],
  research: ['research', 'interview', 'discovery', 'analysis'],
  product: ['plan', 'strategy', 'roadmap', 'prioritize'],
};

function inferWorkflowStage(task: TaskRecord): WorkflowStage {
  const text = (task.task_text ?? '').toLowerCase();
  for (const [stage, keywords] of Object.entries(WORKFLOW_KEYWORDS)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return stage as WorkflowStage;
    }
  }

  return 'unknown';
}

function extractSkillTags(task: TaskRecord): string[] {
  const text = (task.task_text ?? '').toLowerCase();
  const matched = new Set<string>();
  for (const [skill, keywords] of Object.entries(SKILL_KEYWORDS)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      matched.add(skill);
    }
  }
  return Array.from(matched);
}

function computeConfidence(indicatorCount: number): number {
  // Lowered threshold: 2 indicators = moderate confidence, 3+ = high confidence
  if (indicatorCount < 2) {
    return 0;
  }
  if (indicatorCount === 2) {
    return 0.6; // Moderate confidence
  }
  if (indicatorCount === 3) {
    return 0.75; // High confidence
  }
  return Math.min(1, 0.75 + 0.25 * (indicatorCount - 3)); // Very high confidence for 4
}

/**
 * Check if there's a dependency path from source to target
 * This uses BFS to detect if adding a bridging task would create a cycle
 */
function hasReversePath(
  sourceId: string,
  targetId: string,
  relationships: RelationshipRecord[]
): boolean {
  // Build adjacency list
  const adjacency = new Map<string, Set<string>>();
  for (const rel of relationships) {
    if (!adjacency.has(rel.source_task_id)) {
      adjacency.set(rel.source_task_id, new Set());
    }
    adjacency.get(rel.source_task_id)!.add(rel.target_task_id);
  }

  // BFS to find path from source to target
  const visited = new Set<string>();
  const queue: string[] = [sourceId];
  visited.add(sourceId);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === targetId) {
      return true; // Found path!
    }

    const neighbors = adjacency.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  return false; // No path found
}

export async function detectGaps(taskIds: string[]): Promise<GapDetectionResponse> {
  if (!Array.isArray(taskIds) || taskIds.length < 2) {
    throw new Error('At least two task IDs are required to detect gaps');
  }

  const startTime = Date.now();

  const { tasks, missingIds, recoveredTaskIds } = await getTaskRecordsByIds(taskIds, {
    recoverMissing: true,
  });

  if (tasks.length === 0) {
    throw new MissingTaskError('No tasks found for provided task IDs');
  }

  if (missingIds.length > 0) {
    throw new MissingTaskError(`Missing task embeddings for IDs: ${missingIds.join(', ')}`);
  }

  if (recoveredTaskIds.length > 0) {
    console.warn('[GapDetection] Recovered tasks from structured_output fallback', {
      recovered_count: recoveredTaskIds.length,
    });
  }

  const { data: relationshipRows, error: relationshipsError } = await supabase
    .from('task_relationships')
    .select('source_task_id, target_task_id, relationship_type')
    .in('source_task_id', taskIds)
    .in('target_task_id', taskIds);

  if (relationshipsError) {
    throw new Error(`Failed to load task relationships: ${relationshipsError.message}`);
  }

  const relationships = (relationshipRows ?? []) as RelationshipRecord[];
  const relationshipSet = new Set(
    relationships
      .filter(rel => rel.relationship_type === 'prerequisite' || rel.relationship_type === 'blocks')
      .map(rel => `${rel.source_task_id}→${rel.target_task_id}`)
  );

  const orderedTasks = tasks;
  const pairsAnalyzed = Math.max(0, orderedTasks.length - 1);

  const gaps: Gap[] = [];

  for (let index = 0; index < orderedTasks.length - 1; index += 1) {
    const predecessor = orderedTasks[index];
    const successor = orderedTasks[index + 1];

    const predecessorDate = predecessor.created_at ? new Date(predecessor.created_at) : null;
    const successorDate = successor.created_at ? new Date(successor.created_at) : null;
    let timeGap = false;
    if (predecessorDate && successorDate) {
      const diffMs = successorDate.getTime() - predecessorDate.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      timeGap = diffMs > sevenDaysMs;
    }

    const predecessorStage = inferWorkflowStage(predecessor);
    const successorStage = inferWorkflowStage(successor);
    let actionTypeJump = false;
    if (predecessorStage !== 'unknown' && successorStage !== 'unknown') {
      const predecessorIndex = WORKFLOW_STAGES.indexOf(predecessorStage as Exclude<WorkflowStage, 'unknown'>);
      const successorIndex = WORKFLOW_STAGES.indexOf(successorStage as Exclude<WorkflowStage, 'unknown'>);
      actionTypeJump = Math.abs(successorIndex - predecessorIndex) >= 2;
    }

    const dependencyKey = `${predecessor.task_id}→${successor.task_id}`;
    const hasDirectDependency = relationshipSet.has(dependencyKey);
    const noDependency = !hasDirectDependency;

    const predecessorSkills = extractSkillTags(predecessor);
    const successorSkills = extractSkillTags(successor);
    let skillJump = false;
    if (predecessorSkills.length > 0 && successorSkills.length > 0) {
      skillJump = predecessorSkills.every(skill => !successorSkills.includes(skill));
    }

    const indicators = {
      time_gap: timeGap,
      action_type_jump: actionTypeJump,
      no_dependency: noDependency,
      skill_jump: skillJump,
    };

    const indicatorCount = Object.values(indicators).filter(Boolean).length;
    const confidence = computeConfidence(indicatorCount);

    // Lower threshold to 2 indicators for better detection
    // (was 3, which was too conservative and missed real gaps)
    if (indicatorCount >= 2) {
      // Check if there's already a reverse path (successor → predecessor)
      // If so, adding a bridging task would create a cycle
      const wouldCreateCycle = hasReversePath(successor.task_id, predecessor.task_id, relationships);

      if (wouldCreateCycle) {
        console.log('[GapDetection] Gap SKIPPED (would create cycle)', {
          predecessor: predecessor.task_text.substring(0, 50),
          successor: successor.task_text.substring(0, 50),
          reason: 'Reverse dependency path exists (successor → predecessor)',
          indicatorCount,
        });
        continue; // Skip this gap
      }

      console.log('[GapDetection] Gap detected', {
        predecessor: predecessor.task_text.substring(0, 50),
        successor: successor.task_text.substring(0, 50),
        indicatorCount,
        indicators,
        confidence,
      });

      gaps.push({
        id: randomUUID(),
        predecessor_task_id: predecessor.task_id,
        successor_task_id: successor.task_id,
        indicators,
        confidence,
        detected_at: new Date().toISOString(),
      });
    } else {
      // Log why gap was NOT detected (helps debugging)
      console.log('[GapDetection] Gap NOT detected (insufficient indicators)', {
        predecessor: predecessor.task_text.substring(0, 50),
        successor: successor.task_text.substring(0, 50),
        indicatorCount,
        required: 2,
        indicators,
      });
    }
  }

  gaps.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    const aIndicators = Object.values(a.indicators).filter(Boolean).length;
    const bIndicators = Object.values(b.indicators).filter(Boolean).length;
    return bIndicators - aIndicators;
  });

  const topGaps = gaps.slice(0, 3);
  const analysisDurationMs = Math.max(0, Date.now() - startTime);

  console.log('[GapDetection] Analysis complete', {
    pairs_analyzed: pairsAnalyzed,
    gaps_found: topGaps.length,
    duration_ms: analysisDurationMs,
    task_count: orderedTasks.length,
  });

  if (topGaps.length === 0 && pairsAnalyzed > 0) {
    console.log('[GapDetection] No gaps detected - all task pairs had <2 indicators', {
      hint: 'Your tasks may be too similar or have explicit dependencies. Try adding more diverse tasks from different workflow stages.'
    });
  }

  return {
    gaps: topGaps,
    metadata: {
      total_pairs_analyzed: pairsAnalyzed,
      gaps_detected: topGaps.length,
      analysis_duration_ms: analysisDurationMs,
    },
  };
}
