/**
 * Integration test for T006: Circular Dependency Prevention
 *
 * Tests the complete flow of detecting and preventing circular dependencies
 * when accepting bridging tasks through the API.
 *
 * Test Scenario (from tasks.md):
 * 1. Create task list with potential cycle: Task A → Task B → Task C
 * 2. Manually trigger gap detection between C and A
 * 3. Accept generated bridging task (would create C → Bridging → A cycle)
 * 4. Verify 409 error displayed: "Circular dependency detected"
 * 5. Check explanation shows cycle path
 * 6. Uncheck problematic task
 * 7. Accept different tasks successfully
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabase } from '@/lib/supabase';
import { randomUUID } from 'node:crypto';

describe('T006: Circular Dependency Prevention', () => {
  const testDocumentId = 'test-doc-cycle-prevention';
  const taskIds = {
    taskA: 'aaaaaaaa-0000-0000-0000-000000000001',
    taskB: 'bbbbbbbb-0000-0000-0000-000000000002',
    taskC: 'cccccccc-0000-0000-0000-000000000003',
    bridgingTask: 'dddddddd-0000-0000-0000-000000000004',
  };
  const analysisSessionId = 'gap-session-cycle';
  const agentSessionId = 'eeeeeeee-0000-0000-0000-000000000005';
  const outcomeId = 'ffffffff-0000-0000-0000-000000000006';
  const testUserId = `cycle-test-user-${randomUUID()}`;

  beforeEach(async () => {
    // Clean up any existing test data
    await supabase.from('task_relationships').delete().in('source_task_id', Object.values(taskIds));
    await supabase.from('task_relationships').delete().in('target_task_id', Object.values(taskIds));
    await supabase.from('task_embeddings').delete().in('task_id', Object.values(taskIds));
    await supabase.from('agent_sessions').delete().eq('id', agentSessionId);
    await supabase.from('user_outcomes').delete().eq('id', outcomeId);

    // Create test tasks: A → B → C (linear dependency chain)
    const testEmbedding = Array.from({ length: 1536 }, () => 0.1);

    await supabase.from('task_embeddings').insert([
      {
        task_id: taskIds.taskA,
        task_text: 'Task A: Design app mockups',
        document_id: testDocumentId,
        embedding: testEmbedding,
        status: 'completed',
      },
      {
        task_id: taskIds.taskB,
        task_text: 'Task B: Implement core features',
        document_id: testDocumentId,
        embedding: testEmbedding,
        status: 'completed',
      },
      {
        task_id: taskIds.taskC,
        task_text: 'Task C: Launch on app store',
        document_id: testDocumentId,
        embedding: testEmbedding,
        status: 'completed',
      },
    ]);

    // Create relationships: A → B → C
    await supabase.from('task_relationships').insert([
      {
        source_task_id: taskIds.taskA,
        target_task_id: taskIds.taskB,
        relationship_type: 'prerequisite',
        detection_method: 'manual',
        confidence_score: 1.0,
      },
      {
        source_task_id: taskIds.taskB,
        target_task_id: taskIds.taskC,
        relationship_type: 'prerequisite',
        detection_method: 'manual',
        confidence_score: 1.0,
      },
    ]);

    // Create supporting user outcome and agent session for acceptance flow
    await supabase.from('user_outcomes').insert([
      {
        id: outcomeId,
        user_id: testUserId,
        direction: 'launch',
        object_text: 'Test objective',
        metric_text: 'Test metric',
        clarifier: 'Integration test clarifier text',
        assembled_text: 'Launch the test initiative successfully.',
        is_active: false,
      },
    ]);

    const prioritizedPlan = {
      ordered_task_ids: [taskIds.taskA, taskIds.taskB, taskIds.taskC],
      execution_waves: [
        {
          wave_number: 1,
          task_ids: [taskIds.taskA, taskIds.taskB, taskIds.taskC],
          parallel_execution: false,
          estimated_duration_hours: null,
        },
      ],
      dependencies: [
        {
          source_task_id: taskIds.taskA,
          target_task_id: taskIds.taskB,
          relationship_type: 'prerequisite',
          confidence: 0.95,
          detection_method: 'stored_relationship',
        },
        {
          source_task_id: taskIds.taskB,
          target_task_id: taskIds.taskC,
          relationship_type: 'prerequisite',
          confidence: 0.95,
          detection_method: 'stored_relationship',
        },
      ],
      confidence_scores: {
        [taskIds.taskA]: 0.9,
        [taskIds.taskB]: 0.85,
        [taskIds.taskC]: 0.88,
      },
      task_annotations: [],
      removed_tasks: [],
      synthesis_summary: 'Baseline prioritized plan for circular dependency prevention tests.',
    };

    const gapAnalysis = {
      session_id: analysisSessionId,
      trigger_timestamp: new Date().toISOString(),
      plan_snapshot: prioritizedPlan.ordered_task_ids.map(taskId => ({
        task_id: taskId,
        task_text:
          taskId === taskIds.taskA
            ? 'Task A: Design app mockups'
            : taskId === taskIds.taskB
            ? 'Task B: Implement core features'
            : 'Task C: Launch on app store',
        estimated_hours: 40,
        depends_on:
          taskId === taskIds.taskA
            ? []
            : taskId === taskIds.taskB
            ? [taskIds.taskA]
            : [taskIds.taskB],
      })),
      detected_gaps: [
        {
          predecessor_id: taskIds.taskC,
          successor_id: taskIds.taskA,
          gap_type: 'dependency',
          confidence: 0.8,
          indicators: {
            time_gap: false,
            action_type_jump: false,
            no_dependency: true,
            skill_jump: false,
          },
        },
        {
          predecessor_id: taskIds.taskA,
          successor_id: taskIds.taskB,
          gap_type: 'dependency',
          confidence: 0.8,
          indicators: {
            time_gap: false,
            action_type_jump: false,
            no_dependency: true,
            skill_jump: false,
          },
        },
      ],
      generated_tasks: [],
      user_acceptances: [],
      insertion_result: {
        success: false,
        inserted_task_ids: [],
        error: null,
      },
      performance_metrics: {
        detection_ms: 120,
        generation_ms: 480,
        total_ms: 600,
        search_query_count: 2,
      },
    };

    await supabase.from('agent_sessions').insert([
      {
        id: agentSessionId,
        user_id: testUserId,
        outcome_id: outcomeId,
        status: 'completed',
        prioritized_plan: prioritizedPlan,
        execution_metadata: {},
        result: {
          gap_analysis: gapAnalysis,
        },
      },
    ]);
  });

  afterEach(async () => {
    // Clean up test data
    await supabase.from('task_relationships').delete().in('source_task_id', Object.values(taskIds));
    await supabase.from('task_relationships').delete().in('target_task_id', Object.values(taskIds));
    await supabase.from('task_embeddings').delete().in('task_id', Object.values(taskIds));
    await supabase.from('agent_sessions').delete().eq('id', agentSessionId);
    await supabase.from('user_outcomes').delete().eq('id', outcomeId);
  });

  it('detects and prevents circular dependency when accepting bridging task', async () => {
    // Step 1-2: We have A → B → C already set up
    // Step 3: Attempt to accept a bridging task that would create C → Bridging → A
    // This would create a cycle: A → B → C → Bridging → A

    const bridgingTask = {
      id: taskIds.bridgingTask,
      gap_id: 'gap-cycle-test',
      task_text: 'Bridging task that would create a cycle',
      estimated_hours: 40,
      cognition_level: 'medium' as const,
      confidence: 0.8,
      reasoning: 'This task would create a circular dependency if accepted.',
      source: 'ai_generated' as const,
      requires_review: true,
      created_at: new Date().toISOString(),
    };

    const response = await fetch('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        analysis_session_id: analysisSessionId,
        agent_session_id: agentSessionId,
        accepted_tasks: [
          {
            task: bridgingTask,
            predecessor_id: taskIds.taskC, // C → Bridging
            successor_id: taskIds.taskA,   // Bridging → A (creates cycle)
          },
        ],
      }),
    });

    // Step 4: Verify 409 error returned
    expect(response.status).toBe(409);

    const errorData = await response.json();

    // Step 5: Check explanation shows cycle information
    expect(errorData.error).toContain('circular dependency');
    expect(errorData.code).toBe('CYCLE_DETECTED');
    expect(errorData.validation_errors).toBeDefined();
    expect(errorData.validation_errors.length).toBeGreaterThan(0);

    // Verify cycle path is described in validation errors
    const cycleMessage = errorData.validation_errors[0];
    expect(cycleMessage.toLowerCase()).toContain('cycle');

    // Verify no bridging task was inserted
    const { data: insertedTask } = await supabase
      .from('task_embeddings')
      .select('task_id')
      .eq('task_id', taskIds.bridgingTask)
      .single();

    expect(insertedTask).toBeNull();

    // Verify no new relationships were created
    const { data: relationships } = await supabase
      .from('task_relationships')
      .select('*')
      .or(`source_task_id.eq.${taskIds.bridgingTask},target_task_id.eq.${taskIds.bridgingTask}`);

    expect(relationships).toEqual([]);
  });

  it('accepts bridging task successfully when no cycle would be created', async () => {
    // Step 6-7: Accept a different bridging task that doesn't create a cycle
    // Insert between A and B (A → Bridging → B) - no cycle

    const bridgingTask = {
      id: taskIds.bridgingTask,
      gap_id: 'gap-valid-test',
      task_text: 'Valid bridging task between A and B',
      estimated_hours: 32,
      cognition_level: 'low' as const,
      confidence: 0.85,
      reasoning: 'This task fills a gap without creating a cycle.',
      source: 'ai_generated' as const,
      requires_review: true,
      created_at: new Date().toISOString(),
    };

    const response = await fetch('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        analysis_session_id: analysisSessionId,
        agent_session_id: agentSessionId,
        accepted_tasks: [
          {
            task: bridgingTask,
            predecessor_id: taskIds.taskA, // A → Bridging
            successor_id: taskIds.taskB,   // Bridging → B (no cycle)
          },
        ],
      }),
    });

    // Verify 201 success status
    expect(response.status).toBe(201);

    const result = await response.json();

    // Verify insertion details
    expect(result.inserted_count).toBe(1);
    expect(result.task_ids).toContain(taskIds.bridgingTask);
    expect(result.relationships_created).toBe(2);

    // Verify bridging task was inserted
    const { data: insertedTask } = await supabase
      .from('task_embeddings')
      .select('task_id, task_text, document_id')
      .eq('task_id', taskIds.bridgingTask)
      .single();

    expect(insertedTask).not.toBeNull();
    expect(insertedTask?.task_text).toBe('Valid bridging task between A and B');
    expect(insertedTask?.document_id).toBe(testDocumentId);

    // Verify relationships were created
    const { data: relationships } = await supabase
      .from('task_relationships')
      .select('source_task_id, target_task_id, relationship_type')
      .or(`source_task_id.eq.${taskIds.bridgingTask},target_task_id.eq.${taskIds.bridgingTask}`)
      .order('source_task_id');

    expect(relationships).toHaveLength(2);

    // Verify A → Bridging relationship
    const predRelationship = relationships?.find(
      r => r.source_task_id === taskIds.taskA && r.target_task_id === taskIds.bridgingTask
    );
    expect(predRelationship).toBeDefined();
    expect(predRelationship?.relationship_type).toBe('prerequisite');

    // Verify Bridging → B relationship
    const succRelationship = relationships?.find(
      r => r.source_task_id === taskIds.bridgingTask && r.target_task_id === taskIds.taskB
    );
    expect(succRelationship).toBeDefined();
    expect(succRelationship?.relationship_type).toBe('prerequisite');
  });

  it('maintains 100% dependency chain integrity after cycle prevention', async () => {
    // Attempt to create a cycle
    const bridgingTask = {
      id: taskIds.bridgingTask,
      gap_id: 'gap-integrity-test',
      task_text: 'Task that would break integrity',
      estimated_hours: 24,
      cognition_level: 'medium' as const,
      confidence: 0.75,
      reasoning: 'Testing dependency integrity preservation.',
      source: 'ai_generated' as const,
      requires_review: true,
      created_at: new Date().toISOString(),
    };

    await fetch('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accepted_tasks: [
          {
            task: bridgingTask,
            predecessor_id: taskIds.taskC,
            successor_id: taskIds.taskA,
          },
        ],
      }),
    });

    // Verify original relationships remain intact
    const { data: originalRelationships } = await supabase
      .from('task_relationships')
      .select('source_task_id, target_task_id')
      .or(`source_task_id.in.(${taskIds.taskA},${taskIds.taskB}),target_task_id.in.(${taskIds.taskB},${taskIds.taskC})`);

    // Should still have A → B and B → C relationships
    expect(originalRelationships).toHaveLength(2);

    const hasAtoB = originalRelationships?.some(
      r => r.source_task_id === taskIds.taskA && r.target_task_id === taskIds.taskB
    );
    const hasBtoC = originalRelationships?.some(
      r => r.source_task_id === taskIds.taskB && r.target_task_id === taskIds.taskC
    );

    expect(hasAtoB).toBe(true);
    expect(hasBtoC).toBe(true);

    // Verify no partial writes occurred
    const { data: bridgingTaskCheck } = await supabase
      .from('task_embeddings')
      .select('task_id')
      .eq('task_id', taskIds.bridgingTask)
      .single();

    expect(bridgingTaskCheck).toBeNull();
  });
});
