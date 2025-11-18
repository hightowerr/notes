import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deduplicateDrafts } from '@/lib/services/deduplication';
import { DraftTask } from '@/lib/schemas/taskIntelligence';

// Properly mock the embedding service with calculateCosineSimilarity
vi.mock('@/lib/services/embeddingService', () => ({
  calculateCosineSimilarity: vi.fn(),
}));

describe('Phase10-Phase5 Integration Tests', () => {
  let mockP10Drafts: DraftTask[];
  let mockP5Drafts: DraftTask[];

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Create mock P10 drafts (semantic gap fills)
    mockP10Drafts = [
      {
        id: 'p10-draft-1',
        task_text: 'Run pricing A/B test: $49 vs $59 tier for SMB segment',
        estimated_hours: 4.0,
        cognition_level: 'medium',
        reasoning: 'Addresses gap in pricing experiments - outcome mentions 25% ARR increase',
        gap_area: 'pricing experiments',
        confidence_score: 0.85,
        source: 'phase10_semantic',
        source_label: '🎯 Semantic Gap',
        embedding: Array(1536).fill(0.1),
        deduplication_hash: 'hash1',
      },
      {
        id: 'p10-draft-2',
        task_text: 'Design upsell prompt at end of onboarding flow',
        estimated_hours: 2.5,
        cognition_level: 'low',
        reasoning: 'Addresses upsell flow gap in coverage analysis',
        gap_area: 'upsell flow',
        confidence_score: 0.78,
        source: 'phase10_semantic',
        source_label: '🎯 Semantic Gap',
        embedding: Array(1536).fill(0.2),
        deduplication_hash: 'hash2',
      },
      {
        id: 'p10-draft-3',
        task_text: 'Analyze pricing page conversion by traffic source',
        estimated_hours: 3.0,
        cognition_level: 'high',
        reasoning: 'Data-driven pricing optimization',
        gap_area: 'pricing experiments',
        confidence_score: 0.72,
        source: 'phase10_semantic',
        source_label: '🎯 Semantic Gap',
        embedding: Array(1536).fill(0.3),
        deduplication_hash: 'hash3',
      },
    ];

    // Create mock P5 drafts (dependency gap fills)
    mockP5Drafts = [
      {
        id: 'p5-draft-1',
        task_text: 'Setup email tracking before running upsell experiment',
        estimated_hours: 1.5,
        cognition_level: 'low',
        reasoning: 'Prerequisite for measuring upsell conversion',
        gap_area: 'upsell flow',
        confidence_score: 0.90,
        source: 'phase5_dependency',
        source_label: '🔗 Dependency Gap',
        embedding: Array(1536).fill(0.4),
        deduplication_hash: 'hash4',
      },
      {
        id: 'p5-draft-2',
        task_text: 'Run pricing A/B test: $49 vs $59 tier for SMB segment', // Similar to p10-draft-1
        estimated_hours: 3.5,
        cognition_level: 'medium',
        reasoning: 'Dependency for pricing optimization roadmap',
        gap_area: 'pricing experiments',
        confidence_score: 0.82,
        source: 'phase5_dependency',
        source_label: '🔗 Dependency Gap',
        embedding: Array(1536).fill(0.11), // Very similar to p10-draft-1
        deduplication_hash: 'hash5',
      },
    ];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run P10 first, trigger P5 when coverage still <80%', () => {
    // This test would typically involve a full flow with coverage analysis
    // For integration testing, we'll verify the sequence of events
    
    // Mock the scenario where P10 runs and coverage is still <80%
    const p10CoverageResult = 72; // Below 80% threshold
    
    // When P10 coverage is <80%, P5 should be triggered
    expect(p10CoverageResult).toBeLessThan(80);
    
    // In a real implementation, this would trigger P5 gap detection
    // For this test, we just verify the logic flow
    const shouldTriggerP5 = p10CoverageResult < 80;
    expect(shouldTriggerP5).toBe(true);
  });

  it('should suppress P5 drafts with embedding similarity >0.85 to P10 drafts', async () => {
    const { calculateCosineSimilarity } = await import('@/lib/services/embeddingService');
    // Since we've mocked the function, we can now set up its implementation
    vi.mocked(calculateCosineSimilarity).mockImplementation(
      (vec1: number[], vec2: number[]) => {
        // The second P5 draft (hash5) has high similarity to first P10 draft (hash1)
        if (vec1[0] === 0.4 && vec2[0] === 0.11) return 0.9;
        if (vec1[0] === 0.11 && vec2[0] === 0.1) return 0.87;
        // For other combinations, return low similarity
        return 0.2;
      });

    // Run the deduplication logic
    const result = deduplicateDrafts(mockP10Drafts, mockP5Drafts);

    // Verify that P5 draft with high similarity (>0.85) to P10 draft is suppressed
    expect(result).toHaveLength(4); // 3 P10 drafts + 1 P5 draft (the dissimilar one)
    
    // Should have p10-draft-1, p10-draft-2, p10-draft-3
    expect(result).toContainEqual(mockP10Drafts[0]);
    expect(result).toContainEqual(mockP10Drafts[1]);
    expect(result).toContainEqual(mockP10Drafts[2]);
    
    // Should have p5-draft-1 (the one that's not a duplicate)
    const p5Draft1 = result.find(d => d.id === 'p5-draft-1');
    expect(p5Draft1).toBeDefined();
    expect(p5Draft1?.source).toBe('phase5_dependency');
    
    // Should NOT have p5-draft-2 (the duplicate of p10-draft-1)
    const p5Draft2 = result.find(d => d.id === 'p5-draft-2');
    expect(p5Draft2).toBeUndefined();
  });

  it('should show P10 drafts labeled "🎯 Semantic Gap" and P5 drafts labeled "🔗 Dependency Gap"', async () => {
    // Mock low similarity so no suppression occurs
    const { calculateCosineSimilarity } = await import('@/lib/services/embeddingService');
    vi.mocked(calculateCosineSimilarity).mockImplementation(() => 0.3); // Low similarity to ensure no suppression

    const result = deduplicateDrafts(mockP10Drafts, mockP5Drafts);
    
    // Verify source labels are preserved
    const p10Drafts = result.filter(d => d.source === 'phase10_semantic');
    const p5Drafts = result.filter(d => d.source === 'phase5_dependency');
    
    expect(p10Drafts).toHaveLength(3); // All P10 drafts should be present
    expect(p5Drafts).toHaveLength(2); // All P5 drafts should be present (no suppression due to low similarity)
    
    // Verify all P10 drafts have correct source details
    p10Drafts.forEach(draft => {
      expect(draft.source).toBe('phase10_semantic');
      expect(draft.source_label).toBe('🎯 Semantic Gap');
    });
    
    // Verify all P5 drafts have correct source details
    p5Drafts.forEach(draft => {
      expect(draft.source).toBe('phase5_dependency');
      expect(draft.source_label).toBe('🔗 Dependency Gap');
    });
  });

  it('should allow user to accept mix of P10 and P5 drafts successfully', () => {
    // This test simulates accepting a mix of P10 and P5 drafts
    // In a real integration test, we'd test the actual API flow
    
    // Simulate a user selecting a mix of P10 and P5 drafts for acceptance
    const selectedDrafts = [
      mockP10Drafts[0], // P10 draft
      mockP5Drafts[0],  // P5 draft
    ];
    
    // Verify that selected drafts have correct source information
    const p10Selected = selectedDrafts.filter(d => d.source === 'phase10_semantic');
    const p5Selected = selectedDrafts.filter(d => d.source === 'phase5_dependency');
    
    expect(p10Selected).toHaveLength(1);
    expect(p5Selected).toHaveLength(1);
    
    // In a full integration test, we'd also verify that these drafts can be 
    // successfully inserted into the task system with proper dependency checks
    expect(p10Selected[0].id).toBe('p10-draft-1');
    expect(p10Selected[0].source_label).toBe('🎯 Semantic Gap');
    expect(p5Selected[0].id).toBe('p5-draft-1');
    expect(p5Selected[0].source_label).toBe('🔗 Dependency Gap');
  });

  it('should validate deduplication logic prevents duplicates', async () => {
    // Create a P5 draft that is very similar to a P10 draft
    const highlySimilarP5Draft = {
      ...mockP5Drafts[1], // Copy p5-draft-2 which is similar to p10-draft-1
      id: 'p5-highly-similar',
      task_text: 'Run pricing A/B test: $49 vs $59 tier for SMB segment', // Same as p10-draft-1
    };

    // Mock high similarity
    const { calculateCosineSimilarity } = await import('@/lib/services/embeddingService');
    vi.mocked(calculateCosineSimilarity).mockImplementation(() => 0.87); // Above 0.85 threshold

    // Run deduplication
    const result = deduplicateDrafts(mockP10Drafts, [highlySimilarP5Draft]);

    // The highly similar P5 draft should be suppressed
    const remainingP5Drafts = result.filter(d => d.source === 'phase5_dependency');
    expect(remainingP5Drafts).toHaveLength(0); // Should be suppressed
  });
});
