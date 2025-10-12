/**
 * Contract Tests: /api/outcomes
 * Tests the outcome management API endpoints (GET and POST)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_USER_ID = 'default-user';
const API_BASE = 'http://localhost:3000';

describe('/api/outcomes', () => {
  let createdOutcomeIds: string[] = [];

  // Cleanup: Remove all test outcomes before and after tests
  beforeAll(async () => {
    await supabase
      .from('user_outcomes')
      .delete()
      .eq('user_id', DEFAULT_USER_ID);
  });

  afterAll(async () => {
    // Clean up all created outcomes
    if (createdOutcomeIds.length > 0) {
      await supabase
        .from('user_outcomes')
        .delete()
        .in('id', createdOutcomeIds);
    }

    // Final cleanup - remove any test outcomes
    await supabase
      .from('user_outcomes')
      .delete()
      .eq('user_id', DEFAULT_USER_ID);
  });

  describe('GET /api/outcomes', () => {
    it('should return 404 when no outcome is set', async () => {
      const response = await fetch(`${API_BASE}/api/outcomes`);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.outcome).toBeNull();
      expect(data.message).toBe('No active outcome set');
    });

    it('should return 200 with outcome when active outcome exists', async () => {
      // Create test outcome directly in database
      const { data: outcome, error } = await supabase
        .from('user_outcomes')
        .insert({
          user_id: DEFAULT_USER_ID,
          direction: 'increase',
          object_text: 'monthly recurring revenue',
          metric_text: '25% within 6 months',
          clarifier: 'enterprise customer acquisition',
          assembled_text: 'Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition',
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      createdOutcomeIds.push(outcome.id);

      const response = await fetch(`${API_BASE}/api/outcomes`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.outcome).toBeDefined();
      expect(data.outcome.id).toBe(outcome.id);
      expect(data.outcome.direction).toBe('increase');
      expect(data.outcome.object_text).toBe('monthly recurring revenue');
      expect(data.outcome.metric_text).toBe('25% within 6 months');
      expect(data.outcome.clarifier).toBe('enterprise customer acquisition');
      expect(data.outcome.assembled_text).toContain('Increase the');
      expect(data.outcome.is_active).toBe(true);

      // Cleanup for next test
      await supabase
        .from('user_outcomes')
        .delete()
        .eq('id', outcome.id);

      createdOutcomeIds = createdOutcomeIds.filter(id => id !== outcome.id);
    });
  });

  describe('POST /api/outcomes', () => {
    it('should create first outcome with 201 status', async () => {
      const outcomeData = {
        direction: 'increase',
        object: 'monthly recurring revenue',
        metric: '25% within 6 months',
        clarifier: 'enterprise customer acquisition'
      };

      const response = await fetch(`${API_BASE}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outcomeData)
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.assembled_text).toBe('Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition');
      expect(data.created_at).toBeDefined();
      expect(data.message).toContain('Outcome created successfully');
      expect(data.message).toContain('Re-scoring');

      createdOutcomeIds.push(data.id);

      // Verify in database
      const { data: dbOutcome } = await supabase
        .from('user_outcomes')
        .select()
        .eq('id', data.id)
        .single();

      expect(dbOutcome).toBeDefined();
      expect(dbOutcome?.is_active).toBe(true);
    });

    it('should update existing outcome with 200 status', async () => {
      // First outcome already exists from previous test
      const newOutcomeData = {
        direction: 'decrease',
        object: 'customer churn rate',
        metric: '15% within 3 months',
        clarifier: 'proactive onboarding support'
      };

      const response = await fetch(`${API_BASE}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOutcomeData)
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBeDefined();
      expect(data.assembled_text).toBe('Decrease the customer churn rate by 15% within 3 months through proactive onboarding support');
      expect(data.updated_at).toBeDefined();
      expect(data.message).toContain('Outcome updated');

      createdOutcomeIds.push(data.id);

      // Verify old outcome is deactivated
      const { data: oldOutcomes } = await supabase
        .from('user_outcomes')
        .select()
        .eq('user_id', DEFAULT_USER_ID)
        .eq('is_active', false);

      expect(oldOutcomes).toBeDefined();
      expect(oldOutcomes?.length).toBeGreaterThanOrEqual(1);

      // Verify new outcome is active
      const { data: activeOutcome } = await supabase
        .from('user_outcomes')
        .select()
        .eq('id', data.id)
        .single();

      expect(activeOutcome?.is_active).toBe(true);
    });

    it('should return 400 for validation error (object too short)', async () => {
      const invalidData = {
        direction: 'increase',
        object: 'ab', // Only 2 characters (min 3)
        metric: '25% within 6 months',
        clarifier: 'enterprise customer acquisition'
      };

      const response = await fetch(`${API_BASE}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.details).toBeDefined();
      expect(data.details.object).toBeDefined();
      expect(data.details.object[0]).toContain('at least 3 characters');
    });

    it('should return 400 for validation error (metric too long)', async () => {
      const invalidData = {
        direction: 'increase',
        object: 'monthly recurring revenue',
        metric: 'a'.repeat(101), // 101 characters (max 100)
        clarifier: 'enterprise customer acquisition'
      };

      const response = await fetch(`${API_BASE}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.details).toBeDefined();
      expect(data.details.metric).toBeDefined();
      expect(data.details.metric[0]).toContain('not exceed 100 characters');
    });

    it('should return 400 for invalid direction enum', async () => {
      const invalidData = {
        direction: 'invalid-direction',
        object: 'monthly recurring revenue',
        metric: '25% within 6 months',
        clarifier: 'enterprise customer acquisition'
      };

      const response = await fetch(`${API_BASE}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.details).toBeDefined();
      expect(data.details.direction).toBeDefined();
    });

    it('should omit "the" article for Launch direction', async () => {
      // Clean up existing outcomes first
      await supabase
        .from('user_outcomes')
        .delete()
        .eq('user_id', DEFAULT_USER_ID);

      createdOutcomeIds = [];

      const launchData = {
        direction: 'launch',
        object: 'beta product to 50 users',
        metric: 'by Q2 2025',
        clarifier: 'targeted outreach campaigns'
      };

      const response = await fetch(`${API_BASE}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(launchData)
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      // Verify "the" article is omitted for Launch
      expect(data.assembled_text).toBe('Launch beta product to 50 users by by Q2 2025 through targeted outreach campaigns');
      expect(data.assembled_text).not.toContain('Launch the');

      createdOutcomeIds.push(data.id);
    });

    it('should omit "the" article for Ship direction', async () => {
      const shipData = {
        direction: 'ship',
        object: 'new feature to production',
        metric: 'within 2 weeks',
        clarifier: 'iterative deployment strategy'
      };

      const response = await fetch(`${API_BASE}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shipData)
      });

      const data = await response.json();

      expect(response.status).toBe(200); // 200 because outcome already exists
      // Verify "the" article is omitted for Ship
      expect(data.assembled_text).toBe('Ship new feature to production by within 2 weeks through iterative deployment strategy');
      expect(data.assembled_text).not.toContain('Ship the');

      createdOutcomeIds.push(data.id);
    });

    it('should include "the" article for Increase direction', async () => {
      const increaseData = {
        direction: 'increase',
        object: 'user engagement',
        metric: '30% in Q1',
        clarifier: 'gamification features'
      };

      const response = await fetch(`${API_BASE}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(increaseData)
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      // Verify "the" article is included for Increase
      expect(data.assembled_text).toBe('Increase the user engagement by 30% in Q1 through gamification features');
      expect(data.assembled_text).toContain('Increase the');

      createdOutcomeIds.push(data.id);
    });

    it('should return only the new outcome after replacement', async () => {
      // Create initial outcome
      const firstData = {
        direction: 'maintain',
        object: 'code quality standards',
        metric: 'above 90%',
        clarifier: 'automated testing'
      };

      const firstResponse = await fetch(`${API_BASE}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firstData)
      });
      const firstResult = await firstResponse.json();
      createdOutcomeIds.push(firstResult.id);

      // Replace with new outcome
      const secondData = {
        direction: 'increase',
        object: 'test coverage',
        metric: 'to 95%',
        clarifier: 'comprehensive unit tests'
      };

      await fetch(`${API_BASE}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secondData)
      });

      // GET should return only the new outcome
      const getResponse = await fetch(`${API_BASE}/api/outcomes`);
      const getData = await getResponse.json();

      expect(getResponse.status).toBe(200);
      expect(getData.outcome).toBeDefined();
      expect(getData.outcome.direction).toBe('increase');
      expect(getData.outcome.object_text).toBe('test coverage');
      expect(getData.outcome.id).not.toBe(firstResult.id);

      // Verify only one active outcome exists
      const { data: activeOutcomes } = await supabase
        .from('user_outcomes')
        .select()
        .eq('user_id', DEFAULT_USER_ID)
        .eq('is_active', true);

      expect(activeOutcomes?.length).toBe(1);
    });
  });
});
