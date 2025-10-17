/**
 * Contract Tests: /api/reflections
 * Tests the reflection capture API endpoints (GET and POST)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_USER_ID = 'anonymous-user-p0';
const API_BASE = 'http://localhost:3000';

describe('/api/reflections', () => {
  let createdReflectionIds: string[] = [];

  // Cleanup: Remove all test reflections before and after tests
  beforeAll(async () => {
    await supabase
      .from('reflections')
      .delete()
      .eq('user_id', DEFAULT_USER_ID);
  });

  afterAll(async () => {
    // Clean up all created reflections
    if (createdReflectionIds.length > 0) {
      await supabase
        .from('reflections')
        .delete()
        .in('id', createdReflectionIds);
    }

    // Final cleanup - remove any test reflections
    await supabase
      .from('reflections')
      .delete()
      .eq('user_id', DEFAULT_USER_ID);
  });

  describe('GET /api/reflections', () => {
    it('should return empty array when no reflections exist', async () => {
      const response = await fetch(`${API_BASE}/api/reflections?limit=5`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.reflections).toBeDefined();
      expect(Array.isArray(data.reflections)).toBe(true);
      expect(data.reflections.length).toBe(0);
    });

    it('should return reflections with weights and timestamps', async () => {
      // Create test reflection directly in database
      const { data: reflection, error } = await supabase
        .from('reflections')
        .insert({
          user_id: DEFAULT_USER_ID,
          text: 'Test reflection for GET endpoint validation',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      createdReflectionIds.push(reflection.id);

      const response = await fetch(`${API_BASE}/api/reflections?limit=5`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.reflections).toBeDefined();
      expect(data.reflections.length).toBeGreaterThan(0);

      const firstReflection = data.reflections[0];
      expect(firstReflection.id).toBeDefined();
      expect(firstReflection.text).toBe('Test reflection for GET endpoint validation');
      expect(firstReflection.weight).toBeDefined();
      expect(firstReflection.relative_time).toBeDefined();
      expect(firstReflection.created_at).toBeDefined();

      // Cleanup
      await supabase
        .from('reflections')
        .delete()
        .eq('id', reflection.id);

      createdReflectionIds = createdReflectionIds.filter(id => id !== reflection.id);
    });

    it('should respect limit parameter (max 10)', async () => {
      // Create 15 test reflections
      const reflections = Array.from({ length: 15 }, (_, i) => ({
        user_id: DEFAULT_USER_ID,
        text: `Test reflection ${i + 1} for limit validation`,
        created_at: new Date().toISOString()
      }));

      const { data: created, error } = await supabase
        .from('reflections')
        .insert(reflections)
        .select();

      if (error) throw error;
      createdReflectionIds.push(...created.map((r: any) => r.id));

      // Test with limit=5
      const response5 = await fetch(`${API_BASE}/api/reflections?limit=5`);
      const data5 = await response5.json();
      expect(data5.reflections.length).toBe(5);

      // Test with limit=10
      const response10 = await fetch(`${API_BASE}/api/reflections?limit=10`);
      const data10 = await response10.json();
      expect(data10.reflections.length).toBe(10);

      // Test with limit=20 (should cap at 10)
      const response20 = await fetch(`${API_BASE}/api/reflections?limit=20`);
      const data20 = await response20.json();
      expect(data20.reflections.length).toBe(10);

      // Cleanup
      await supabase
        .from('reflections')
        .delete()
        .in('id', created.map((r: any) => r.id));

      createdReflectionIds = [];
    });
  });

  describe('POST /api/reflections', () => {
    it('should create reflection with valid text (10-500 chars)', async () => {
      const reflectionData = {
        text: 'Valid reflection text with exactly ten characters minimum'
      };

      const response = await fetch(`${API_BASE}/api/reflections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reflectionData)
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.text).toBe(reflectionData.text);
      expect(data.weight).toBe(1.0); // New reflection should have full weight
      expect(data.relative_time).toBeDefined();
      expect(data.created_at).toBeDefined();

      createdReflectionIds.push(data.id);

      // Verify in database
      const { data: dbReflection } = await supabase
        .from('reflections')
        .select()
        .eq('id', data.id)
        .single();

      expect(dbReflection).toBeDefined();
      expect(dbReflection?.text).toBe(reflectionData.text);
    });

    it('should return 400 for text too short (<10 chars)', async () => {
      const invalidData = {
        text: 'Short' // Only 5 characters (min 10)
      };

      const response = await fetch(`${API_BASE}/api/reflections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation Error');
      expect(data.message).toBeDefined();
      expect(data.message).toContain('at least 10 characters');
      expect(data.field).toBe('text');
    });

    it('should return 400 for text too long (>500 chars)', async () => {
      const invalidData = {
        text: 'a'.repeat(501) // 501 characters (max 500)
      };

      const response = await fetch(`${API_BASE}/api/reflections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation Error');
      expect(data.message).toBeDefined();
      expect(data.message).toContain('at most 500 characters');
      expect(data.field).toBe('text');
    });

    it('should return 400 for missing text field', async () => {
      const invalidData = {};

      const response = await fetch(`${API_BASE}/api/reflections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation Error');
      expect(data.message).toBeDefined();
    });

    it('should return 400 for empty string', async () => {
      const invalidData = {
        text: ''
      };

      const response = await fetch(`${API_BASE}/api/reflections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation Error');
      expect(data.message).toBeDefined();
      expect(data.message).toContain('at least 10 characters');
    });

    it('should return 400 for null text', async () => {
      const invalidData = {
        text: null
      };

      const response = await fetch(`${API_BASE}/api/reflections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation Error');
      expect(data.message).toBeDefined();
    });

    it('should trim whitespace from text', async () => {
      const reflectionData = {
        text: '   Valid reflection with leading and trailing spaces   '
      };

      const response = await fetch(`${API_BASE}/api/reflections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reflectionData)
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.text).toBe('Valid reflection with leading and trailing spaces');
      expect(data.text).not.toContain('   '); // No triple spaces

      createdReflectionIds.push(data.id);
    });

    it('should accept text at exactly 10 characters (minimum)', async () => {
      const reflectionData = {
        text: 'Ten chars!' // Exactly 10 characters
      };

      const response = await fetch(`${API_BASE}/api/reflections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reflectionData)
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.text).toBe('Ten chars!');

      createdReflectionIds.push(data.id);
    });

    it('should accept text at exactly 500 characters (maximum)', async () => {
      const reflectionData = {
        text: 'a'.repeat(500) // Exactly 500 characters
      };

      const response = await fetch(`${API_BASE}/api/reflections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reflectionData)
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.text).toBe('a'.repeat(500));

      createdReflectionIds.push(data.id);
    });

    it('should create multiple reflections sequentially', async () => {
      const reflections = [
        'First reflection with minimum required length',
        'Second reflection capturing different context here',
        'Third reflection for testing sequential creation'
      ];

      const createdIds: string[] = [];

      for (const text of reflections) {
        const response = await fetch(`${API_BASE}/api/reflections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });

        const data = await response.json();
        expect(response.status).toBe(201);
        expect(data.id).toBeDefined();
        createdIds.push(data.id);
      }

      createdReflectionIds.push(...createdIds);

      // Verify all reflections exist in database
      const { data: dbReflections } = await supabase
        .from('reflections')
        .select()
        .in('id', createdIds);

      expect(dbReflections?.length).toBe(3);
    });
  });
});
