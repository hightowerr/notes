'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { OutcomeResponse } from '@/lib/schemas/outcomeSchema';

interface OutcomeDisplayProps {
  onEdit?: (outcome: OutcomeResponse) => void;
}

/**
 * OutcomeDisplay - Persistent header banner showing active outcome
 *
 * Features:
 * - Fetches active outcome on mount
 * - Displays assembled text with 🎯 icon
 * - Edit icon (✏️) triggers onEdit callback
 * - Fixed position at top of page
 * - Shown across all pages
 *
 * @param onEdit - Callback when edit icon is clicked
 */
export function OutcomeDisplay({ onEdit }: OutcomeDisplayProps) {
  const [outcome, setOutcome] = useState<OutcomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch active outcome on mount
  useEffect(() => {
    fetchOutcome();
  }, []);

  const fetchOutcome = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/outcomes');
      const data = await response.json();

      if (response.ok && data.outcome) {
        setOutcome(data.outcome);
      } else {
        // No active outcome (404) or error
        setOutcome(null);
      }
    } catch (err) {
      console.error('[OutcomeDisplay] Failed to fetch outcome:', err);
      setError('Failed to load outcome');
    } finally {
      setLoading(false);
    }
  };

  // Public method to refresh outcome (called after save)
  // Expose via ref or global event in future enhancement
  const refreshOutcome = () => {
    fetchOutcome();
  };

  // Expose refresh method globally for other components
  useEffect(() => {
    // @ts-ignore - global method for refreshing outcome display
    window.refreshOutcomeDisplay = refreshOutcome;
    return () => {
      // @ts-ignore
      delete window.refreshOutcomeDisplay;
    };
  }, []);

  // Don't render anything if loading or no outcome
  if (loading || !outcome) {
    return null;
  }

  // Don't render if error (silent failure - user can still use app)
  if (error) {
    return null;
  }

  // Build context display string
  const contextParts = [];
  if (outcome.state_preference) contextParts.push(outcome.state_preference);
  if (outcome.daily_capacity_hours) contextParts.push(`${outcome.daily_capacity_hours}h/day`);
  const contextText = contextParts.length > 0 ? ` • ${contextParts.join(' • ')}` : '';

  return (
    <div className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-2xl" aria-label="Target">
            🎯
          </span>
          <p className="text-sm font-medium truncate" title={`${outcome.assembled_text}${contextText}`}>
            {outcome.assembled_text}
            {contextText && (
              <span className="text-muted-foreground">{contextText}</span>
            )}
          </p>
        </div>

        {onEdit && outcome && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(outcome)}
            className="ml-2 shrink-0"
            aria-label="Edit outcome"
          >
            <span className="text-xl">✏️</span>
          </Button>
        )}
      </div>
    </div>
  );
}
