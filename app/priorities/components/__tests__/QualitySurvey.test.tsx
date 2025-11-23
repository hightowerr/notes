import { describe, it, expect } from 'vitest';

import {
  nextSurveyStateAfterRun,
  shouldShowSurvey,
  type SurveyState,
} from '../QualitySurvey';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

describe('QualitySurvey trigger logic', () => {
  it('shows after 20 runs and resets counter', () => {
    let state: SurveyState = { runCount: 0, lastShownAt: null, dontShowAgain: false };
    let shouldShow = false;

    for (let i = 0; i < 20; i += 1) {
      const result = nextSurveyStateAfterRun(state, Date.now());
      state = result.state;
      shouldShow = shouldShow || result.show;
    }

    expect(shouldShow).toBe(true);
    expect(state.runCount).toBe(0);
    expect(typeof state.lastShownAt).toBe('string');
  });

  it('triggers after a week even without 20 runs', () => {
    const now = Date.now();
    const state: SurveyState = {
      runCount: 1,
      lastShownAt: new Date(now - WEEK_MS - 1).toISOString(),
      dontShowAgain: false,
    };
    expect(shouldShowSurvey(state, now)).toBe(true);
  });

  it('respects dontShowAgain flag', () => {
    const state: SurveyState = {
      runCount: 25,
      lastShownAt: null,
      dontShowAgain: true,
    };
    expect(shouldShowSurvey(state, Date.now())).toBe(false);
  });
});
