// lib/mastra/init.ts
import { Telemetry } from '@mastra/core';
import { mastra } from './config';
import { agentTools } from './tools';
import type { ToolExecutionStatus } from '@/lib/types/mastra';

type AgentTool = (typeof agentTools)[number];

const performanceNow =
  typeof globalThis !== 'undefined' &&
  typeof globalThis.performance !== 'undefined' &&
  typeof globalThis.performance.now === 'function'
    ? () => globalThis.performance.now()
    : () => Date.now();

const registeredTools: AgentTool[] = [];
let initialized = false;

function cloneValue<T>(value: T): T {
  if (value === null || typeof value === 'undefined') {
    return value;
  }

  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
}

function normalizeParams(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return cloneValue(value as Record<string, unknown>);
  }

  return { value: cloneValue(value) };
}

function createInstrumentedExecute(tool: AgentTool): AgentTool['execute'] | undefined {
  const originalExecute = typeof tool.execute === 'function' ? tool.execute.bind(tool) : undefined;
  if (!originalExecute) {
    return undefined;
  }

  const executeWithInstrumentation: AgentTool['execute'] = async (...args: any[]) => {
    const [rawParams, rawOptions] = args;
    const inputParams = normalizeParams(rawParams);
    const retryCount =
      rawOptions && typeof rawOptions.retryCount === 'number' ? rawOptions.retryCount : 0;

    const status: { current: ToolExecutionStatus } = { current: 'success' };
    let output: unknown;
    let errorMessage: string | undefined;

    const start = performanceNow();

    try {
      output = await originalExecute(...args);
      return output;
    } catch (error) {
      status.current = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      const duration = Math.max(0, Math.round(performanceNow() - start));
      const performanceWarning = duration > 5000;

      const activeSpan = typeof Telemetry.getActiveSpan === 'function' ? Telemetry.getActiveSpan() : undefined;
      activeSpan?.setAttribute('tool.id', tool.id);
      activeSpan?.setAttribute('tool.duration_ms', duration);
      activeSpan?.setAttribute('tool.retry_count', retryCount);
      activeSpan?.setAttribute('tool.performance_warning', performanceWarning);
      activeSpan?.setAttribute('tool.status', status.current);
      activeSpan?.setAttribute('tool.input_params', JSON.stringify(inputParams));

      if (status.current === 'error' && errorMessage) {
        activeSpan?.setAttribute('tool.error_message', errorMessage);
      } else if (status.current === 'success' && typeof output !== 'undefined') {
        activeSpan?.setAttribute('tool.output_sample', JSON.stringify(cloneValue(output)));
      }

      const logger = mastra.getLogger?.();
      logger?.info?.('[Mastra][ToolExecution]', {
        toolId: tool.id,
        status: status.current,
        durationMs: duration,
        performanceWarning,
        retryCount,
      });
    }
  };

  const telemetry = mastra.getTelemetry?.();
  if (telemetry?.traceMethod) {
    return telemetry.traceMethod(executeWithInstrumentation, {
      spanName: `tool.${tool.id}.execute`,
      attributes: { 'tool.id': tool.id },
      skipIfNoTelemetry: true,
    });
  }

  return executeWithInstrumentation;
}

export function initializeMastra() {
  if (initialized) {
    return mastra;
  }

  agentTools.forEach(tool => {
    const instrumentedExecute = createInstrumentedExecute(tool);
    if (instrumentedExecute) {
      tool.execute = instrumentedExecute;
    }
    mastra.registerTool?.(tool);
    registeredTools.push(tool);
  });

  initialized = true;
  console.log(`[Mastra] Initialized with ${registeredTools.length} tools`);
  return mastra;
}

export function getRegisteredTools(): AgentTool[] {
  return [...registeredTools];
}

export function findRegisteredTool(id: string): AgentTool | undefined {
  return registeredTools.find(tool => tool.id === id);
}

// Auto-initialize on import (server-side only)
if (typeof window === 'undefined') {
  initializeMastra();
}
