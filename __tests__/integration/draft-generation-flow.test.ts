import { describe, it, expect, beforeAll, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { DraftTask, DraftTasksSession } from '@/lib/schemas/taskIntelligence';

const MOCK_DRAFT_ID_1 = '11111111-1111-1111-1111-111111111111';
const MOCK_DRAFT_ID_2 = '22222222-2222-2222-2222-222222222222';
const MOCK_BRIDGE_DRAFT_ID = '33333333-3333-3333-3333-333333333333';
const MOCK_EXISTING_TASK_ID_1 = '44444444-4444-4444-4444-444444444444';
const MOCK_EXISTING_TASK_ID_2 = '55555555-5555-5555-5555-555555555555';
const MOCK_GAP_ID = '66666666-6666-6666-6666-666666666666';
const MOCK_EXISTING_TASK_TEXTS = ['Existing task 1', 'Existing task 2'];

// Mock the authentication function to return a test user
vi.mock('@/lib/services/planIntegration', async () => {
  const actual = await vi.importActual('@/lib/services/planIntegration');
  return {
    ...actual,
    getAuthUser: vi.fn().mockResolvedValue({
      id: 'test-user-id',
      email: 'test@example.com'
    }),
  };
});

// Mock Supabase calls with realistic responses
vi.mock('@/lib/supabase/server', () => {
  // Create a mock supabase client that supports proper method chaining
  const mockSupabaseClient = {
    from: vi.fn((table) => {
      if (table === 'task_embeddings') {
        return {
          select: vi.fn((columns) => {
            // Handle different select operations based on columns requested
            if (columns === 'task_text, embedding') {
              return {
                in: vi.fn().mockReturnThis(), // Return the same object to allow method chaining
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      task_text: 'Existing task 1',
                      embedding: Array(1536).fill(0.05),
                    },
                    {
                      task_text: 'Existing task 2',
                      embedding: Array(1536).fill(0.06),
                    },
                  ],
                  error: null
                }), // This is the final call that returns data for task_embeddings limit query
              };
            } else if (columns === 'task_id') {
              return {
                in: vi.fn().mockResolvedValue({
                  data: [],
                  error: null
                }), // Return data for duplicate check
                eq: vi.fn().mockReturnThis(), // For user_id filter
                not: vi.fn().mockReturnThis(), // For the 'is null' check
              };
            } else if (columns === 'task_id, task_text, embedding') {
              return {
                eq: vi.fn().mockResolvedValue({
                  data: [],
                  error: null
                }), // Final call for fetching all tasks with embeddings
              };
            }
            // Default behavior for other select operations
            return {
              in: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              not: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null
              }),
            };
          }),
          insert: vi.fn(() => ({
            select: vi.fn().mockResolvedValue({
              data: [{ task_id: 'new-task-id' }],
              error: null
            }),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: null
            })
          })), // For quality metadata update
        };
      } else if (table === 'agent_sessions') {
        const createAgentSessionUpdateBuilder = () => {
          const result = { data: null, error: null };
          const builder: any = {};
          const eqMock = vi.fn()
            .mockImplementationOnce(() => builder)
            .mockImplementation(() => Promise.resolve(result));
          builder.eq = eqMock;
          return builder;
        };

        return {
          select: vi.fn((columns) => {
            // Handle different select operations based on columns requested
            if (columns === 'result, user_id') {
              return {
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: {
                    user_id: 'test-user-id',
                    result: {
                      outcome_text: 'Increase ARR by 25%',
                      draft_tasks: {
                        generated: [
                          {
                            id: MOCK_DRAFT_ID_1,
                            task_text: 'Test draft task A',
                            gap_area: 'test',
                            embedding: Array(1536).fill(0.1) // Mock embedding with proper length
                          },
                          {
                            id: MOCK_DRAFT_ID_2,
                            task_text: 'Test draft task B',
                            gap_area: 'test',
                            embedding: Array(1536).fill(0.1)
                          }
                        ],
                        accepted: [],
                        dismissed: [],
                        generated_at: new Date().toISOString(),
                      }
                    }
                  },
                  error: null
                }),
              };
            } else if (columns === 'result, outcome_id') {
              return {
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: {
                    user_id: 'test-user-id',
                    outcome_id: 'outcome-1',
                    result: {
                      outcome_text: 'Increase ARR by 25%',
                      draft_tasks: {
                        generated: [
                          {
                            id: MOCK_DRAFT_ID_1,
                            task_text: 'Test draft task A',
                            gap_area: 'test',
                            embedding: Array(1536).fill(0.1) // Mock embedding with proper length
                          },
                          {
                            id: MOCK_DRAFT_ID_2,
                            task_text: 'Test draft task B',
                            gap_area: 'test',
                            embedding: Array(1536).fill(0.1)
                          }
                        ],
                        accepted: [],
                        dismissed: [],
                        generated_at: new Date().toISOString(),
                      },
                      coverage_analysis: { coverage_percentage: 65 }
                    }
                  },
                  error: null
                }),
              };
            }
            // Default behavior
            return {
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: null,
                error: null
              }),
            };
          }),
          update: vi.fn(() => createAgentSessionUpdateBuilder()), // For updating agent sessions
          eq: vi.fn().mockReturnThis(),
        };
      } else if (table === 'user_outcomes') {
        // Handle user outcomes table
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { outcome_text: 'Increase ARR by 25%' },
              error: null
            }),
          })),
        };
      } else if (table === 'task_relationships') {
        // Handle task relationships table for cycle detection
        return {
          select: vi.fn(() => ({
            mockResolvedValue: { data: [], error: null } // Default for cycle detection
          })),
          eq: vi.fn().mockReturnThis(),
        };
      }

      // Default return for any other table
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null
        }),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null
        }),
        insert: vi.fn().mockResolvedValue({
          data: [],
          error: null
        }),
        update: vi.fn().mockReturnThis(),
      };
    }),
  };

  return {
    createClient: vi.fn().mockResolvedValue(mockSupabaseClient),
  };
});

// Mock the analyzeCoverage function to avoid vector length errors
vi.mock('@/lib/services/taskIntelligence', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    analyzeCoverage: vi.fn().mockResolvedValue({ coverage_percentage: 65 }),
  };
});

// Mock the draft generation service to avoid AI calls
vi.mock('@/lib/services/draftTaskGeneration', () => ({
  generateDrafts: vi.fn().mockResolvedValue({
    drafts: [
      {
        id: MOCK_DRAFT_ID_1,
        task_text: 'Implement pricing A/B test: $49 vs $59 tier for SMB segment',
        estimated_hours: 4.0,
        cognition_level: 'medium',
        reasoning: 'Addresses gap in pricing experiments - outcome mentions 25% ARR increase',
        gap_area: 'pricing experiments',
        confidence_score: 0.85,
        source: 'phase10_semantic',
        source_label: '🎯 Semantic Gap',
        embedding: Array(1536).fill(0.1),
        deduplication_hash: 'a3f5b2c8d4e6f1a9b7c5d3e8f2a4b6c9d1e3f5a7b9c2d4e6f8a1b3c5d7e9f2a4',
      },
      {
        id: MOCK_DRAFT_ID_2,
        task_text: 'Develop feature for customer onboarding flow',
        estimated_hours: 6.0,
        cognition_level: 'high',
        reasoning: 'Addresses gap in feature development - directly supports user acquisition goal',
        gap_area: 'feature development',
        confidence_score: 0.78,
        source: 'phase10_semantic',
        source_label: '🎯 Semantic Gap',
        embedding: Array(1536).fill(0.12),
        deduplication_hash: 'b4f5b2c8d4e6f1a9b7c5d3e8f2a4b6c9d1e3f5a7b9c2d4e6f8a1b3c5d7e9f2a5',
      }
    ],
    generation_duration_ms: 1200,
  }),
  DraftTaskGenerationError: class extends Error {
    constructor(message, code, metadata) {
      super(message);
      this.code = code;
      this.metadata = metadata;
    }
  }
}));

// Mock the suggestBridgingTasksTool since it's used in the API
const suggestBridgingTasksExecuteMock = vi.fn().mockResolvedValue({
  bridging_tasks: [
    {
      id: MOCK_BRIDGE_DRAFT_ID,
      task_text: 'Prepare bridge task for dependency gaps',
      estimated_hours: 3.0,
      cognition_level: 'medium',
      reasoning: 'Bridging gaps between existing tasks',
      confidence: 0.75,
      embedding: Array(1536).fill(0.2),
    }
  ]
});

vi.mock('@/lib/mastra/tools/suggestBridgingTasks', () => ({
  suggestBridgingTasksTool: {
    execute: suggestBridgingTasksExecuteMock,
  }
}));

const detectGapsMock = vi.fn().mockResolvedValue({
  gaps: [
    {
      id: MOCK_GAP_ID,
      predecessor_task_id: MOCK_EXISTING_TASK_ID_1,
      successor_task_id: MOCK_EXISTING_TASK_ID_2,
      indicators: {
        time_gap: true,
        action_type_jump: true,
        no_dependency: true,
        skill_jump: false,
      },
      confidence: 0.85,
      detected_at: new Date().toISOString(),
    },
  ],
  metadata: {
    total_pairs_analyzed: 1,
    gaps_detected: 1,
    analysis_duration_ms: 5,
  },
});

vi.mock('@/lib/services/gapDetectionService', () => ({
  detectGaps: detectGapsMock,
}));

// Mock the embedding service to avoid actual AI calls
vi.mock('@/lib/services/embeddingService', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
  calculateCosineSimilarity: vi.fn().mockImplementation((a, b) => 0.75), // Return a mock similarity value
}));

// Mock the quality evaluation service
vi.mock('@/lib/services/qualityEvaluation', () => ({
  evaluateQuality: vi.fn().mockResolvedValue({
    quality_metadata: {
      clarity_score: 0.8,
      verb_strength: 'strong',
      specificity_indicators: {
        has_metrics: true,
        has_acceptance_criteria: true,
        contains_numbers: true,
      },
      granularity_flags: {
        estimated_size: 'medium',
        is_atomic: true,
      },
      improvement_suggestions: [],
    }
  })
}));

// Mock the deduplication service
vi.mock('@/lib/services/deduplication', () => ({
  deduplicateDrafts: vi.fn().mockImplementation((p10Drafts, p5Drafts) => {
    // Simply return combined drafts without actual deduplication for testing
    return [...p10Drafts, ...p5Drafts];
  })
}));

describe('Draft Generation Flow - Integration Tests', () => {
  let sessionId: string;

  beforeAll(() => {
    // Set up test data
    sessionId = randomUUID();
  });

  it('should successfully generate draft tasks via API call', async () => {
    // Mock request object for the API route
    const mockRequest = new Request('http://localhost:3000/api/agent/generate-draft-tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-token'}`,
      },
      body: JSON.stringify({
        outcome_text: 'Increase ARR by 25%',
        missing_areas: ['pricing experiments', 'feature development'],
        existing_task_ids: [MOCK_EXISTING_TASK_ID_1, MOCK_EXISTING_TASK_ID_2],
        existing_task_texts: MOCK_EXISTING_TASK_TEXTS,
        session_id: sessionId
      }),
    });

    // Import and call the POST function directly from the API route
    const { POST } = await import('@/app/api/agent/generate-draft-tasks/route');

    // Call the API endpoint
    const response = await POST(mockRequest);

    // Assert: Verify the response
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('drafts');
    expect(data).toHaveProperty('phase5_triggered');
    expect(data).toHaveProperty('generation_duration_ms');
    expect(data).toHaveProperty('deduplication_stats');

    // Validate structure of drafts
    expect(Array.isArray(data.drafts)).toBe(true);
    expect(data.drafts.length).toBeGreaterThan(0);

    // Validate each draft item
    for (const draft of data.drafts) {
      expect(draft).toHaveProperty('id');
      expect(draft).toHaveProperty('task_text');
      expect(draft).toHaveProperty('estimated_hours');
      expect(draft).toHaveProperty('cognition_level');
      expect(draft).toHaveProperty('reasoning');
      expect(draft).toHaveProperty('gap_area');
      expect(draft).toHaveProperty('confidence_score');
      expect(draft).toHaveProperty('source');
      expect(draft).toHaveProperty('embedding');
      expect(draft).toHaveProperty('deduplication_hash');

      // Validate types
      expect(typeof draft.id).toBe('string');
      expect(typeof draft.task_text).toBe('string');
      expect(typeof draft.estimated_hours).toBe('number');
      expect(typeof draft.cognition_level).toBe('string');
      expect(typeof draft.reasoning).toBe('string');
      expect(typeof draft.gap_area).toBe('string');
      expect(typeof draft.confidence_score).toBe('number');
      expect(typeof draft.source).toBe('string');
      expect(Array.isArray(draft.embedding)).toBe(true);
      expect(typeof draft.deduplication_hash).toBe('string');
    }

    // Validate phase5_triggered is boolean
    expect(typeof data.phase5_triggered).toBe('boolean');

    // Validate deduplication stats structure
    expect(data.deduplication_stats).toHaveProperty('phase5_total');
    expect(data.deduplication_stats).toHaveProperty('phase5_suppressed');
    expect(data.deduplication_stats).toHaveProperty('final_count');

    expect(detectGapsMock).toHaveBeenCalledWith([
      MOCK_EXISTING_TASK_ID_1,
      MOCK_EXISTING_TASK_ID_2
    ]);
    expect(suggestBridgingTasksExecuteMock).toHaveBeenCalledWith({
      gap_id: MOCK_GAP_ID,
      predecessor_id: MOCK_EXISTING_TASK_ID_1,
      successor_id: MOCK_EXISTING_TASK_ID_2,
      outcome_text: 'Increase ARR by 25%'
    });
  }, 30000); // 30 second timeout for API call

  it('should successfully accept draft tasks via API call', async () => {
    // First generate some drafts to work with
    const generateRequest = new Request('http://localhost:3000/api/agent/generate-draft-tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-token'}`,
      },
      body: JSON.stringify({
        outcome_text: 'Increase ARR by 25%',
        missing_areas: ['pricing experiments'],
        existing_task_ids: [MOCK_EXISTING_TASK_ID_1, MOCK_EXISTING_TASK_ID_2],
        existing_task_texts: MOCK_EXISTING_TASK_TEXTS,
        session_id: sessionId
      }),
    });

    const { POST: generatePOST } = await import('@/app/api/agent/generate-draft-tasks/route');
    const generateResponse = await generatePOST(generateRequest);

    expect(generateResponse.status).toBe(200);
    const generateData = await generateResponse.json();
    expect(generateData.drafts.length).toBeGreaterThan(0);

    // Select a few drafts to accept
    const draftIdsToAccept = generateData.drafts.slice(0, 2).map((draft: any) => draft.id);

    // Prepare request to accept the drafts
    const acceptRequest = new Request('http://localhost:3000/api/agent/accept-draft-tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-token'}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
        accepted_draft_ids: draftIdsToAccept,
        edited_drafts: [
          {
            id: draftIdsToAccept[0],
            task_text: 'Updated pricing experiment task text'
          }
        ]
      }),
    });

    // Make API call to accept draft tasks
    const { POST: acceptPOST } = await import('@/app/api/agent/accept-draft-tasks/route');
    const acceptResponse = await acceptPOST(acceptRequest);

    // Assert the response
    expect(acceptResponse.status).toBe(200);
    const acceptData = await acceptResponse.json();

    expect(acceptData).toHaveProperty('inserted_task_ids');
    expect(acceptData).toHaveProperty('cycle_detected');
    expect(acceptData).toHaveProperty('new_coverage_percentage');

    expect(Array.isArray(acceptData.inserted_task_ids)).toBe(true);
    expect(acceptData.cycle_detected).toBe(false); // Should not detect cycles for new tasks
    expect(typeof acceptData.new_coverage_percentage).toBe('number');
    expect(acceptData.inserted_task_ids.length).toBe(draftIdsToAccept.length);
  }, 30000); // 30 second timeout for API call

  it('should return 400 for invalid request to generate draft tasks', async () => {
    // Arrange: Prepare invalid request object
    const invalidRequest = new Request('http://localhost:3000/api/agent/generate-draft-tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-token'}`,
      },
      body: JSON.stringify({
        outcome_text: '', // Invalid: empty outcome text
        missing_areas: ['pricing experiments'],
        existing_task_ids: [MOCK_EXISTING_TASK_ID_1, MOCK_EXISTING_TASK_ID_2],
        existing_task_texts: MOCK_EXISTING_TASK_TEXTS,
        session_id: sessionId
      }),
    });

    // Act: Make API call with invalid data
    const { POST } = await import('@/app/api/agent/generate-draft-tasks/route');
    const response = await POST(invalidRequest);

    // Assert: Should return 400 for validation error
    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid session to accept draft tasks', async () => {
    // Arrange: Prepare request with invalid session ID
    const invalidRequest = new Request('http://localhost:3000/api/agent/accept-draft-tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-token'}`,
      },
      body: JSON.stringify({
        session_id: 'invalid-session-id', // Invalid UUID format
        accepted_draft_ids: [randomUUID()],
        edited_drafts: []
      }),
    });

    // Act: Make API call with invalid session
    const { POST } = await import('@/app/api/agent/accept-draft-tasks/route');
    const response = await POST(invalidRequest);

    // Assert: Should return 400 for validation error
    expect(response.status).toBe(400);
  });
});
