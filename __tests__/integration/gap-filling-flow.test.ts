import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * T016: Integration test for full gap-filling flow E2E
 *
 * This test validates the complete user journey:
 * 1. Detect gaps in task plan
 * 2. Generate bridging task suggestions
 * 3. Accept selected suggestions
 * 4. Verify tasks are inserted with correct dependencies
 * 5. Verify GapAnalysisSession is logged
 */

// Mock dependencies
const detectGapsMock = vi.fn();
const suggestBridgingTasksExecuteMock = vi.fn();
const insertBridgingTasksMock = vi.fn();

vi.mock('@/lib/services/gapDetectionService', () => ({
  detectGaps: detectGapsMock,
}));

vi.mock('@/lib/mastra/tools/suggestBridgingTasks', () => ({
  suggestBridgingTasksTool: {
    execute: suggestBridgingTasksExecuteMock,
  },
}));

vi.mock('@/lib/services/taskInsertionService', () => ({
  insertBridgingTasks: insertBridgingTasksMock,
}));

const sessionMaybeSingleMock = vi.fn();
const sessionUpdateEqMock = vi.fn();
const userOutcomeMaybeSingleMock = vi.fn();
const getTaskRecordsByIdsMock = vi.fn();

vi.mock('@/lib/services/taskRepository', () => ({
  getTaskRecordsByIds: getTaskRecordsByIdsMock,
}));

vi.mock('@/lib/mastra/services/resultParser', () => ({
  parsePlanFromAgentResponse: vi.fn(() => ({ success: false, plan: null })),
}));

const fromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: fromMock,
  })),
}));

let POST_suggest: typeof import('@/app/api/agent/suggest-gaps/route')['POST'];
let POST_accept: typeof import('@/app/api/gaps/accept/route')['POST'];

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';

  // Setup Supabase mocks
  fromMock.mockImplementation((table: string) => {
    if (table === 'agent_sessions') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: sessionMaybeSingleMock })),
        })),
        update: vi.fn(() => ({ eq: sessionUpdateEqMock })),
      };
    }
    if (table === 'user_outcomes') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: userOutcomeMaybeSingleMock })),
        })),
      };
    }
    if (table === 'task_relationships') {
      return {
        delete: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ error: null }) })),
      };
    }
    if (table === 'task_embeddings') {
      return {
        delete: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ error: null }) })),
      };
    }
    throw new Error(`Unexpected table requested: ${table}`);
  });

  // Import route handlers after mocks are set up
  ({ POST: POST_suggest } = await import('@/app/api/agent/suggest-gaps/route'));
  ({ POST: POST_accept } = await import('@/app/api/gaps/accept/route'));
});

describe('Gap Filling Flow - E2E Integration Test', () => {
  // Test data: agent session with gap (#1, #2, #5)
  const sessionId = '6dc3bef1-7b45-4c8e-9e3c-c454ab76f3d7';
  const outcomeId = 'outcome-456';
  const analysisSessionId = 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5';

  const testSession = {
    id: sessionId,
    user_id: 'user-123',
    outcome_id: outcomeId,
    prioritized_plan: {
      ordered_task_ids: ['task-1', 'task-2', 'task-5'],
      execution_waves: [
        {
          wave_number: 1,
          task_ids: ['task-1'],
          parallel_execution: false,
        },
        {
          wave_number: 2,
          task_ids: ['task-2'],
          parallel_execution: false,
        },
        {
          wave_number: 3,
          task_ids: ['task-5'],
          parallel_execution: false,
        },
      ],
      dependencies: [
        {
          source_task_id: 'task-1',
          target_task_id: 'task-2',
          relationship_type: 'prerequisite',
          confidence: 0.8,
          detection_method: 'stored_relationship',
        },
      ],
      confidence_scores: {
        'task-1': 0.9,
        'task-2': 0.85,
        'task-5': 0.75,
      },
      synthesis_summary: 'Test plan with gap',
      task_annotations: [],
      removed_tasks: [],
    },
    result: null,
  };

  const detectedGap = {
    id: '37b6f57a-f87d-4a4d-8a25-7d0354dced0c',
    predecessor_task_id: 'task-2',
    successor_task_id: 'task-5',
    indicators: {
      time_gap: true,
      action_type_jump: true,
      no_dependency: true,
      skill_jump: false,
    },
    confidence: 0.82,
    detected_at: '2025-10-28T10:00:00.000Z',
  };

  const suggestedTasks = [
    {
      id: '1f3a5b7c-9d8e-4f2a-b6c1-2d3e4f5a6b7c',
      gap_id: detectedGap.id,
      task_text: 'Build MVP frontend with core features',
      estimated_hours: 80,
      cognition_level: 'high' as const,
      confidence: 0.86,
      reasoning:
        'Frontend implementation bridges design and launch phases with user-facing features.',
      source: 'ai_generated' as const,
      requires_review: true,
      created_at: '2025-10-28T10:05:00.000Z',
    },
    {
      id: '2e4b6c8d-0f1a-3b5c-7d9e-8f0a1b2c3d4e',
      gap_id: detectedGap.id,
      task_text: 'Implement backend API and database',
      estimated_hours: 60,
      cognition_level: 'high' as const,
      confidence: 0.78,
      reasoning: 'Backend services required to support frontend functionality and data persistence.',
      source: 'ai_generated' as const,
      requires_review: true,
      created_at: '2025-10-28T10:05:30.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    sessionMaybeSingleMock.mockResolvedValue({ data: testSession, error: null });
    sessionUpdateEqMock.mockResolvedValue({ error: null });
    userOutcomeMaybeSingleMock.mockResolvedValue({
      data: { assembled_text: 'Launch the MVP successfully' },
      error: null,
    });

    getTaskRecordsByIdsMock.mockResolvedValue({
      tasks: [
        {
          task_id: 'task-1',
          task_text: 'Define Q4 goals',
          created_at: null,
          document_id: null,
          source: 'embedding',
        },
        {
          task_id: 'task-2',
          task_text: 'Design app mockups',
          created_at: null,
          document_id: null,
          source: 'embedding',
        },
        {
          task_id: 'task-5',
          task_text: 'Launch on app store',
          created_at: null,
          document_id: null,
          source: 'embedding',
        },
      ],
      missingIds: [],
      recoveredTaskIds: [],
    });
  });

  it('completes full E2E flow: detect gaps → generate tasks → accept → verify insertion', async () => {
    // Step 1: Detect gaps
    detectGapsMock.mockResolvedValue({
      gaps: [detectedGap],
      metadata: {
        analysis_duration_ms: 120,
        total_pairs_analyzed: 2,
        gaps_detected: 1,
      },
    });

    suggestBridgingTasksExecuteMock.mockResolvedValue({
      bridging_tasks: suggestedTasks,
      search_results_count: 4,
      generation_duration_ms: 1500,
    });

    const suggestRequest = new NextRequest('http://localhost:3000/api/agent/suggest-gaps', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
      headers: { 'Content-Type': 'application/json' },
    });

    const suggestResponse = await POST_suggest(suggestRequest);
    expect(suggestResponse.status).toBe(200);

    const suggestData = await suggestResponse.json();

    // Assert: Gaps detected
    expect(suggestData.gaps).toHaveLength(1);
    expect(suggestData.gaps[0]).toMatchObject({
      predecessor_task_id: 'task-2',
      successor_task_id: 'task-5',
      confidence: 0.82,
    });

    // Assert: 2-3 suggestions generated
    expect(suggestData.suggestions).toHaveLength(1);
    expect(suggestData.suggestions[0].status).toBe('success');
    expect(suggestData.suggestions[0].tasks).toHaveLength(2);
    expect(suggestData.suggestions[0].tasks[0]).toMatchObject({
      id: suggestedTasks[0].id,
      task_text: 'Build MVP frontend with core features',
      estimated_hours: 80,
    });

    // Assert: Performance metrics logged
    expect(suggestData.performance_metrics).toMatchObject({
      detection_ms: expect.any(Number),
      generation_ms: expect.any(Number),
      total_ms: expect.any(Number),
    });

    const gapAnalysisSessionId = suggestData.analysis_session_id;
    expect(gapAnalysisSessionId).toBeDefined();

    // Step 2: Simulate user selecting 2 tasks (edit one)
    const selectedTasks = [
      {
        task: {
          ...suggestedTasks[0],
          edited_task_text: 'Build MVP frontend with authentication and core screens',
          edited_estimated_hours: 90,
        },
        predecessor_id: 'task-2',
        successor_id: 'task-5',
      },
      {
        task: suggestedTasks[1],
        predecessor_id: 'task-2',
        successor_id: 'task-5',
      },
    ];

    // Step 3: Accept selected tasks
    const sessionWithGapAnalysis = {
      ...testSession,
      result: {
        gap_analysis: {
          session_id: gapAnalysisSessionId,
          trigger_timestamp: new Date().toISOString(),
          plan_snapshot: testSession.prioritized_plan.ordered_task_ids.map(id => ({
            task_id: id,
            task_text: `Task ${id}`,
            estimated_hours: 40,
            depends_on: [],
          })),
          detected_gaps: [
            {
              predecessor_id: detectedGap.predecessor_task_id,
              successor_id: detectedGap.successor_task_id,
              gap_type: 'dependency' as const,
              confidence: detectedGap.confidence,
              indicators: detectedGap.indicators,
            },
          ],
          generated_tasks: suggestedTasks.map(t => ({
            text: t.task_text,
            estimated_hours: t.estimated_hours,
            required_cognition: t.cognition_level,
            confidence: t.confidence,
            reasoning: t.reasoning,
            source: t.source,
            generated_from: {
              predecessor_id: 'task-2',
              successor_id: 'task-5',
            },
            requires_review: t.requires_review,
            similarity_score: 0.5,
          })),
          user_acceptances: [],
          insertion_result: {
            success: false,
            inserted_task_ids: [],
            error: null,
          },
          performance_metrics: {
            detection_ms: 120,
            generation_ms: 1500,
            total_ms: 1620,
            search_query_count: 1,
          },
        },
      },
    };

    sessionMaybeSingleMock.mockResolvedValue({ data: sessionWithGapAnalysis, error: null });

    insertBridgingTasksMock.mockResolvedValue({
      inserted_count: 2,
      task_ids: [suggestedTasks[0].id, suggestedTasks[1].id],
      relationships_created: 4,
      cycles_resolved: 0,
    });

    const acceptRequest = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        analysis_session_id: gapAnalysisSessionId,
        agent_session_id: sessionId,
        accepted_tasks: selectedTasks,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const acceptResponse = await POST_accept(acceptRequest);
    expect(acceptResponse.status).toBe(201);

    const acceptData = await acceptResponse.json();

    // Step 4: Verify tasks inserted
    expect(acceptData.inserted_count).toBe(2);
    expect(acceptData.task_ids).toEqual([suggestedTasks[0].id, suggestedTasks[1].id]);
    expect(acceptData.relationships_created).toBe(4);

    // Step 5: Verify dependencies updated correctly
    expect(acceptData.updated_plan).toBeDefined();
    expect(acceptData.updated_plan.ordered_task_ids).toContain(suggestedTasks[0].id);
    expect(acceptData.updated_plan.ordered_task_ids).toContain(suggestedTasks[1].id);

    // Step 6: Verify GapAnalysisSession logged with user acceptances
    expect(sessionUpdateEqMock).toHaveBeenCalledWith('id', sessionId);
    const updateCall = sessionUpdateEqMock.mock.calls[0];
    expect(updateCall).toBeDefined();

    // Verify insertBridgingTasks was called with correct parameters
    expect(insertBridgingTasksMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          task: expect.objectContaining({
            id: suggestedTasks[0].id,
            edited_task_text: 'Build MVP frontend with authentication and core screens',
            edited_estimated_hours: 90,
          }),
        }),
      ])
    );

    // Verify gap detection was called
    expect(detectGapsMock).toHaveBeenCalledWith(['task-1', 'task-2', 'task-5']);

    // Verify AI generation was called
    expect(suggestBridgingTasksExecuteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gap_id: detectedGap.id,
        predecessor_id: 'task-2',
        successor_id: 'task-5',
      })
    );
  });

  it('handles no gaps scenario gracefully', async () => {
    detectGapsMock.mockResolvedValue({
      gaps: [],
      metadata: {
        analysis_duration_ms: 80,
        total_pairs_analyzed: 2,
        gaps_detected: 0,
      },
    });

    const request = new NextRequest('http://localhost:3000/api/agent/suggest-gaps', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST_suggest(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.gaps).toHaveLength(0);
    expect(data.suggestions).toHaveLength(0);
    expect(data.analysis_session_id).toBeDefined();
  });

  it('validates E2E flow with edited task values', async () => {
    // This test ensures that edits made by the user are properly carried through
    // the entire flow and reflected in the final inserted tasks

    detectGapsMock.mockResolvedValue({
      gaps: [detectedGap],
      metadata: {
        analysis_duration_ms: 120,
        total_pairs_analyzed: 2,
        gaps_detected: 1,
      },
    });

    suggestBridgingTasksExecuteMock.mockResolvedValue({
      bridging_tasks: [suggestedTasks[0]],
      search_results_count: 2,
      generation_duration_ms: 1200,
    });

    const sessionWithGapAnalysis = {
      ...testSession,
      result: {
        gap_analysis: {
          session_id: analysisSessionId,
          trigger_timestamp: new Date().toISOString(),
          plan_snapshot: [],
          detected_gaps: [
            {
              predecessor_id: detectedGap.predecessor_task_id,
              successor_id: detectedGap.successor_task_id,
              gap_type: 'dependency' as const,
              confidence: detectedGap.confidence,
              indicators: detectedGap.indicators,
            },
          ],
          generated_tasks: [
            {
              text: suggestedTasks[0].task_text,
              estimated_hours: suggestedTasks[0].estimated_hours,
              required_cognition: suggestedTasks[0].cognition_level,
              confidence: suggestedTasks[0].confidence,
              reasoning: suggestedTasks[0].reasoning,
              source: suggestedTasks[0].source,
              generated_from: {
                predecessor_id: 'task-2',
                successor_id: 'task-5',
              },
              requires_review: true,
              similarity_score: 0.5,
            },
          ],
          user_acceptances: [],
          insertion_result: {
            success: false,
            inserted_task_ids: [],
            error: null,
          },
          performance_metrics: {
            detection_ms: 120,
            generation_ms: 1200,
            total_ms: 1320,
            search_query_count: 1,
          },
        },
      },
    };

    sessionMaybeSingleMock.mockResolvedValue({ data: sessionWithGapAnalysis, error: null });

    insertBridgingTasksMock.mockResolvedValue({
      inserted_count: 1,
      task_ids: [suggestedTasks[0].id],
      relationships_created: 2,
      cycles_resolved: 0,
    });

    const editedTask = {
      task: {
        ...suggestedTasks[0],
        edited_task_text: 'Build frontend with custom design',
        edited_estimated_hours: 100,
      },
      predecessor_id: 'task-2',
      successor_id: 'task-5',
    };

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        analysis_session_id: analysisSessionId,
        agent_session_id: sessionId,
        accepted_tasks: [editedTask],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST_accept(request);
    expect(response.status).toBe(201);

    // Verify the edited values were used
    expect(insertBridgingTasksMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          task: expect.objectContaining({
            edited_task_text: 'Build frontend with custom design',
            edited_estimated_hours: 100,
          }),
        }),
      ])
    );
  });
});
