'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Label,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import { QUADRANT_CONFIGS, getQuadrant, type Quadrant } from '@/lib/schemas/quadrant';
import {
  HIGH_IMPACT_THRESHOLD,
  LOW_EFFORT_THRESHOLD,
} from '@/lib/schemas/sortingStrategy';

export type QuadrantVizTask = {
  id: string;
  title: string;
  impact: number;
  effort: number;
  confidence: number;
};

type QuadrantVizProps = {
  tasks: QuadrantVizTask[];
  onTaskClick?: (taskId: string) => void;
  showCountBadge?: boolean;
};

type ClusterPoint = {
  primaryTaskId: string;
  taskIds: string[];
  label: string;
  impact: number;
  effort: number;
  logEffort: number;
  confidence: number;
  count: number;
  quadrant: Quadrant;
  color: string;
};

// ±20% effort threshold on log scale (log(1.2) ≈ 0.182)
const LOG_EFFORT_DELTA = Math.log(1.2);
const MIN_CONFIDENCE = 0.05;

export function QuadrantViz({ tasks, onTaskClick, showCountBadge = true }: QuadrantVizProps) {
  const [isHighContrastMode, setIsHighContrastMode] = useState(false);
  const normalizedTasks = useMemo(
    () =>
      tasks.map(task => ({
        ...task,
        // Clamp values to keep the log axis stable and avoid NaN/Infinity rendering artifacts.
        impact: Math.max(0, Math.min(10, task.impact)),
        effort: Math.max(1, task.effort),
        confidence: Math.max(MIN_CONFIDENCE, task.confidence),
      })),
    [tasks]
  );
  const clusters = useMemo(() => clusterTasks(normalizedTasks), [normalizedTasks]);
  const isStaticRender = Boolean((process as { env?: Record<string, string> })?.env?.VITEST);
  const plottedCount = clusters.reduce((total, cluster) => total + cluster.count, 0);
  const maxEffort = useMemo(
    () => Math.max(LOW_EFFORT_THRESHOLD * 2, ...normalizedTasks.map(task => task.effort || 1)),
    [normalizedTasks]
  );
  const xDomain: [number, number] = [1, Math.max(maxEffort * 1.25, LOW_EFFORT_THRESHOLD * 2)];
  const xTicks = useMemo(() => buildLogTicks(xDomain[1]), [xDomain]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-contrast: more)');
    const handleChange = () => {
      setIsHighContrastMode(mediaQuery.matches);
    };
    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  if (clusters.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
        Strategic scores will appear here after the next prioritization run.
      </div>
    );
  }

  const renderBubbleShape = (bubbleProps: any) => renderBubble(bubbleProps, { isHighContrastMode });

  const chart = (
    <ScatterChart
      width={isStaticRender ? 800 : undefined}
      height={isStaticRender ? 400 : undefined}
      margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
    >
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis
        type="number"
        dataKey="effort"
        name="Effort"
        scale="log"
        domain={xDomain}
        ticks={xTicks}
        tickFormatter={value => (Number.isFinite(value) ? `${value}h` : '')}
        tick={{ fill: '#64748b', fontSize: 12 }}
      >
        <Label value="Effort (hours, log scale)" offset={-10} position="insideBottom" />
      </XAxis>
      <YAxis
        type="number"
        dataKey="impact"
        name="Impact"
        domain={[0, 10]}
        tickFormatter={value => (Number.isFinite(value) ? value : '')}
        tick={{ fill: '#64748b', fontSize: 12 }}
      >
        <Label value="Impact (0-10)" angle={-90} position="insideLeft" offset={10} />
      </YAxis>
        <ZAxis
          type="number"
          dataKey="confidence"
          range={[12, 48]}
          domain={[MIN_CONFIDENCE, 1]}
          name="Confidence"
        />
        <ReferenceLine x={LOW_EFFORT_THRESHOLD} stroke="#94a3b8" strokeDasharray="4 4" />
        <ReferenceLine y={HIGH_IMPACT_THRESHOLD} stroke="#94a3b8" strokeDasharray="4 4" />
        {renderQuadrantAreas()}
        <Tooltip content={<QuadrantTooltip />} />
      <Scatter
        data={clusters}
        shape={renderBubbleShape}
        onClick={(dataPoint: ClusterPoint) => {
          const taskId = dataPoint?.primaryTaskId;
          if (taskId) {
            onTaskClick?.(taskId);
          }
        }}
      />
    </ScatterChart>
  );

  if (isStaticRender) {
    return <div className="h-full w-full">{chart}</div>;
  }

  return (
    <div role="group" aria-label="Impact versus effort quadrant visualization" className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
        {chart}
      </ResponsiveContainer>
    </div>
  );
}

function clusterTasks(tasks: QuadrantVizTask[]): ClusterPoint[] {
  return tasks.reduce<ClusterPoint[]>((clusters, task) => {
    const logEffort = Math.log(Math.max(task.effort, 1));
    const quadrant = getQuadrant(task.impact, task.effort);
    const match = clusters.find(
      cluster =>
        Math.abs(cluster.impact - task.impact) <= 0.5 &&
        Math.abs(cluster.logEffort - logEffort) <= LOG_EFFORT_DELTA
    );

    if (match) {
      match.impact = (match.impact * match.count + task.impact) / (match.count + 1);
      match.effort = (match.effort * match.count + task.effort) / (match.count + 1);
      match.logEffort = Math.log(match.effort);
      match.confidence =
        (match.confidence * match.count + Math.max(task.confidence, MIN_CONFIDENCE)) /
        (match.count + 1);
      match.count += 1;
      match.taskIds.push(task.id);
      match.label = `${match.count} tasks`;
      return clusters;
    }

    const config = QUADRANT_CONFIGS[quadrant];
    clusters.push({
      primaryTaskId: task.id,
      taskIds: [task.id],
      label: task.title,
      impact: task.impact,
      effort: task.effort,
      logEffort,
      confidence: Math.max(task.confidence, MIN_CONFIDENCE),
      count: 1,
      quadrant,
      color: config.color,
    });
    return clusters;
  }, []);
}

function buildLogTicks(upperBound: number): number[] {
  const ticks = new Set<number>();
  const safeUpper = Number.isFinite(upperBound) ? upperBound : LOW_EFFORT_THRESHOLD * 2;
  ticks.add(1);
  ticks.add(LOW_EFFORT_THRESHOLD);

  let value = 2;
  while (value <= safeUpper) {
    ticks.add(Number(value.toFixed(2)));
    value *= 2;
  }

  ticks.add(Math.round(safeUpper));

  return Array.from(ticks)
    .filter(tick => Number.isFinite(tick) && tick >= 1 && tick <= safeUpper)
    .sort((a, b) => a - b);
}

function renderQuadrantAreas() {
  return (
    <>
      <ReferenceArea
        x1={1}
        x2={LOW_EFFORT_THRESHOLD}
        y1={HIGH_IMPACT_THRESHOLD}
        y2={10}
        fill="#10b981"
        fillOpacity={0.1}
      >
        <Label value="Quick Wins" position="insideTopLeft" fill="#047857" />
      </ReferenceArea>
      <ReferenceArea
        x1={LOW_EFFORT_THRESHOLD}
        x2="max"
        y1={HIGH_IMPACT_THRESHOLD}
        y2={10}
        fill="#3b82f6"
        fillOpacity={0.1}
      >
        <Label value="Strategic Bets" position="insideTopRight" fill="#1d4ed8" />
      </ReferenceArea>
      <ReferenceArea
        x1={1}
        x2={LOW_EFFORT_THRESHOLD}
        y1={0}
        y2={HIGH_IMPACT_THRESHOLD}
        fill="#eab308"
        fillOpacity={0.1}
      >
        <Label value="Incremental" position="insideBottomLeft" fill="#a16207" />
      </ReferenceArea>
      <ReferenceArea
        x1={LOW_EFFORT_THRESHOLD}
        x2="max"
        y1={0}
        y2={HIGH_IMPACT_THRESHOLD}
        fill="#ef4444"
        fillOpacity={0.1}
      >
        <Label value="Deprioritize" position="insideBottomRight" fill="#b91c1c" />
      </ReferenceArea>
    </>
  );
}

type BubbleRenderOptions = {
  isHighContrastMode: boolean;
};

function renderBubble(props: any, options: BubbleRenderOptions) {
  const { cx, cy, size, payload, onClick, index, ...rest } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number' || typeof size !== 'number') {
    return null;
  }

  const safeProps = { ...rest };
  delete safeProps.primaryTaskId;
  delete safeProps.taskIds;
  delete safeProps.logEffort;
  delete safeProps.tooltipPayload;
  delete safeProps.tooltipPosition;

  const badgeRadius = 10;
  const bubbleRadius = Math.max(6, Math.min(48, size));
  const ariaLabel =
    payload.count > 1
      ? `${payload.label} group with ${payload.count} tasks`
      : `${payload.label} task bubble`;
  return (
    <g
      {...safeProps}
      data-testid={`quadrant-bubble-${payload.primaryTaskId}`}
      cursor="pointer"
      role="button"
      tabIndex={0}
      focusable="true"
      aria-label={ariaLabel}
      onClick={event => {
        onClick?.(payload, index, event);
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.(payload, index, event);
        }
      }}
    >
      {options.isHighContrastMode && (
        <circle
          cx={cx}
          cy={cy}
          r={bubbleRadius + 4}
          fill="none"
          stroke="var(--text-heading)"
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
      <circle
        data-role="bubble-core"
        cx={cx}
        cy={cy}
        r={bubbleRadius}
        fill={payload.color}
        fillOpacity={0.18}
        stroke={payload.color}
        strokeWidth={2}
      />
      {payload.count > 1 && (
        <g>
          <circle
            cx={cx + Math.max(6, size) - badgeRadius}
            cy={cy - Math.max(6, size) + badgeRadius}
            r={badgeRadius}
            fill={payload.color}
          />
          <text
            x={cx + Math.max(6, size) - badgeRadius}
            y={cy - Math.max(6, size) + badgeRadius + 4}
            textAnchor="middle"
            fontSize="10"
            fill="#fff"
          >
            {payload.count}
          </text>
        </g>
      )}
    </g>
  );
}

function QuadrantTooltip({ active, payload }: any) {
  if (!active || !payload?.length) {
    return null;
  }
  const point: ClusterPoint = payload[0].payload;
  return (
    <div
      role="tooltip"
      aria-label={`Task details: ${point.label}`}
      className="rounded-md border border-border/70 bg-background px-3 py-2 text-sm shadow-md"
    >
      <p className="font-medium text-foreground">{point.label}</p>
      <p className="text-xs text-muted-foreground">
        Impact {point.impact.toFixed(1)} • Effort {point.effort.toFixed(1)}h • Confidence{' '}
        {(point.confidence * 100).toFixed(0)}%
      </p>
    </div>
  );
}
