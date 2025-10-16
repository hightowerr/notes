'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Lightbulb, CheckCircle2, MoveRight, ListTodo, AlertCircle, Clock, TrendingUp, Activity, AlertTriangle, Download, Flame, Check, Code } from 'lucide-react';
import type { DocumentOutput } from '@/lib/schemas';
import { useState } from 'react';
import { toast } from 'sonner';

interface ActionWithMetadata {
  text: string;
  relevance_score?: number;
  estimated_hours?: number;
  effort_level?: 'high' | 'low';
  category?: 'leverage' | 'neutral' | 'overhead';
}

interface FilteringDecisions {
  context: {
    goal: string;
    state: 'Energized' | 'Low energy';
    capacity_hours: number;
    threshold: number;
  };
  included: ActionWithMetadata[];
  excluded: Array<{
    text: string;
    relevance_score: number;
    estimated_hours?: number;
    effort_level?: 'high' | 'low';
    reason: string;
  }>;
  total_actions_extracted: number;
  filtering_duration_ms?: number;
}

interface SummaryPanelProps {
  summary: DocumentOutput;
  confidence: number;
  filename: string;
  processingDuration: number;
  fileId: string;
  filteringDecisions?: FilteringDecisions | null;
  allActions?: ActionWithMetadata[]; // T019: Unfiltered action list
  filteringApplied?: boolean; // T019: Whether filtering was applied
  exclusionReasons?: Array<{ action_text: string; reason: string }>; // T019: Exclusion reasons map
}

export default function SummaryPanel({
  summary,
  confidence,
  filename,
  processingDuration,
  fileId,
  filteringDecisions,
  allActions,
  filteringApplied = false,
  exclusionReasons = [],
}: SummaryPanelProps) {
  const isLowConfidence = confidence < 0.8;
  const durationInSeconds = (processingDuration / 1000).toFixed(1);
  const confidencePercent = Math.round(confidence * 100);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);

  // T019: Calculate filtering stats
  const totalActions = allActions?.length || summary.actions.length;
  const includedCount = summary.actions.length; // Filtered list
  const excludedCount = totalActions - includedCount;

  // T019: Determine which actions to display
  // When showing all: use allActions (unfiltered)
  // When filtered: use summary.actions (filtered)
  const displayActions = showAllActions && allActions
    ? allActions
    : summary.actions;

  // Calculate capacity usage
  const totalCapacityUsed = filteringDecisions
    ? filteringDecisions.included.reduce((sum: number, action: ActionWithMetadata) => {
        return sum + (action.estimated_hours || 0);
      }, 0)
    : 0;

  // Handle export to JSON
  const handleExportJSON = async () => {
    try {
      setExportingFormat('json');
      const response = await fetch(`/api/export/${fileId}?format=json`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export JSON');
      }

      // Create blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename.replace(/\.[^/.]+$/, '')}-summary.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Summary exported as JSON');
    } catch (error) {
      console.error('[SummaryPanel] Export JSON error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to export JSON');
    } finally {
      setExportingFormat(null);
    }
  };

  // Handle export to Markdown
  const handleExportMarkdown = async () => {
    try {
      setExportingFormat('markdown');
      const response = await fetch(`/api/export/${fileId}?format=markdown`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export Markdown');
      }

      // Create blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename.replace(/\.[^/.]+$/, '')}-summary.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Summary exported as Markdown');
    } catch (error) {
      console.error('[SummaryPanel] Export Markdown error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to export Markdown');
    } finally {
      setExportingFormat(null);
    }
  };

  // T020: Download filtering decisions JSON
  const handleDownloadFilteringJSON = () => {
    if (!filteringDecisions) return;

    try {
      const jsonString = JSON.stringify(filteringDecisions, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename.replace(/\.[^/.]+$/, '')}-filtering-decisions.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Filtering decisions downloaded');
    } catch (error) {
      console.error('[SummaryPanel] Download filtering JSON error:', error);
      toast.error('Failed to download filtering decisions');
    }
  };

  return (
    <div className="animate-in slide-in-from-bottom duration-500 fade-in">
      <Card className="overflow-hidden border-0">
        <div className="h-2 gradient-primary" />
        {/* Header */}
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded-full bg-primary-2/10 p-2">
                  <ListTodo className="h-5 w-5 text-primary-2" />
                </div>
                <CardTitle className="text-xl text-text-heading">AI Summary</CardTitle>
              </div>
              <CardDescription className="text-base">{filename}</CardDescription>
            </div>
            <div className="flex flex-col gap-2">
              {/* Export Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportJSON}
                  disabled={exportingFormat !== null}
                  className="flex items-center gap-1.5"
                  aria-label="Export summary as JSON"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportingFormat === 'json' ? 'Exporting...' : 'JSON'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportMarkdown}
                  disabled={exportingFormat !== null}
                  className="flex items-center gap-1.5"
                  aria-label="Export summary as Markdown"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportingFormat === 'markdown' ? 'Exporting...' : 'Markdown'}
                </Button>
              </div>
              {isLowConfidence && (
                <Badge className="bg-warning-bg text-warning-text flex items-center gap-1.5 px-3 py-1 border-0">
                  <AlertCircle className="h-3.5 w-3.5" aria-label="Low confidence warning" />
                  Review Required
                </Badge>
              )}
              <div className="flex flex-col gap-1 rounded-lg bg-bg-layer-3 p-3 shadow-2layer-sm border-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-text-muted">Confidence</span>
                  <span className="text-sm font-bold text-text-heading">{confidencePercent}%</span>
                </div>
                <Progress value={confidence * 100} className="h-1.5" />
              </div>
              <Badge variant="secondary" className="flex items-center gap-1.5 justify-center px-3 py-1 border-0">
                <Clock className="h-3.5 w-3.5" aria-label="Processing time" />
                <span className="text-xs font-medium">{durationInSeconds}s</span>
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                <span>Overview</span>
              </TabsTrigger>
              <TabsTrigger value="actions" className="flex items-center gap-2">
                <MoveRight className="h-4 w-4" />
                <span>Actions</span>
              </TabsTrigger>
              <TabsTrigger value="tasks" className="flex items-center gap-2">
                <ListTodo className="h-4 w-4" />
                <span>Tasks (LNO)</span>
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6 mt-0">
              {/* Topics Section */}
              <section aria-labelledby="topics-heading">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-full bg-primary-2/10 p-2">
                    <Lightbulb className="h-4 w-4 text-primary-2" aria-label="Topics icon" />
                  </div>
                  <h3 id="topics-heading" className="text-base font-semibold text-text-heading">
                    Topics
                  </h3>
                  <Badge variant="secondary" className="ml-auto">
                    {summary.topics.length}
                  </Badge>
                </div>
                {summary.topics.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No topics identified</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {summary.topics.map((topic, index) => (
                      <Badge key={index} variant="secondary" className="px-3 py-1.5 text-sm">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}
              </section>

              <Separator />

              {/* Decisions Section */}
              <section aria-labelledby="decisions-heading">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-full bg-primary-2/10 p-2">
                    <CheckCircle2 className="h-4 w-4 text-primary-2" aria-label="Decisions icon" />
                  </div>
                  <h3 id="decisions-heading" className="text-base font-semibold text-text-heading">
                    Decisions
                  </h3>
                  <Badge variant="secondary" className="ml-auto">
                    {summary.decisions.length}
                  </Badge>
                </div>
                {summary.decisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No decisions identified</p>
                ) : (
                  <div className="space-y-3">
                    {summary.decisions.map((decision, index) => (
                      <Card key={index} className="bg-bg-layer-3 hover-lift border-0">
                        <CardContent className="flex items-start gap-3 p-4">
                          <div className="rounded-full bg-primary-2/10 p-1.5 mt-0.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary-2" aria-hidden="true" />
                          </div>
                          <p className="text-sm leading-relaxed text-text-body">{decision}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>

            {/* Actions Tab */}
            <TabsContent value="actions" className="space-y-4 mt-0">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="rounded-full bg-primary-2/10 p-2">
                    <MoveRight className="h-4 w-4 text-primary-2" aria-label="Actions icon" />
                  </div>
                  <h3 className="text-base font-semibold text-text-heading">
                    Action Items
                  </h3>
                  <Badge variant="secondary" className="ml-auto">
                    {displayActions.length}
                  </Badge>
                </div>

                {/* Filtering Summary (T018) */}
                {filteringApplied && (
                  <div className="bg-info-bg/30 border border-info-text/20 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-info-text font-medium mb-1">
                          Showing {includedCount} of {totalActions} actions matching your context
                        </p>
                        {filteringDecisions && (
                          <div className="text-xs text-text-muted space-y-0.5">
                            <div>State: <span className="font-medium">{filteringDecisions.context.state}</span></div>
                            <div>Capacity: <span className="font-medium">{totalCapacityUsed.toFixed(1)}h / {filteringDecisions.context.capacity_hours}h</span></div>
                          </div>
                        )}
                      </div>
                      {excludedCount > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAllActions(!showAllActions)}
                          className="flex items-center gap-1.5"
                        >
                          {showAllActions ? (
                            <>Show filtered ({includedCount})</>
                          ) : (
                            <>Show all {totalActions} actions</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* No results warning (T018) */}
                {filteringApplied && includedCount === 0 && (
                  <div className="bg-warning-bg/30 border border-warning-text/20 rounded-lg p-4 text-center">
                    <AlertCircle className="h-6 w-6 text-warning-text mx-auto mb-2" />
                    <p className="text-sm text-warning-text font-medium mb-1">
                      No actions align with your outcome
                    </p>
                    <p className="text-xs text-text-muted">
                      Try adjusting your outcome or click &quot;Show all actions&quot; to view unfiltered list.
                    </p>
                  </div>
                )}
              </div>
              {displayActions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No actions identified</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <TooltipProvider>
                    {displayActions.map((action, index) => {
                      // Handle both old string format and new Action object format
                      const actionText = typeof action === 'string' ? action : action?.text || '';
                      const estimatedHours = typeof action === 'object' && action !== null ? action.estimated_hours : undefined;
                      const effortLevel = typeof action === 'object' && action !== null ? action.effort_level : undefined;
                      const relevanceScore = typeof action === 'object' && action !== null ? action.relevance_score : undefined;

                      // T019: Check if this action is excluded
                      // When showing all actions, mark those not in the filtered list
                      const isIncluded = summary.actions.some((a) => {
                        const summaryText = typeof a === 'string' ? a : a?.text || '';
                        return summaryText === actionText;
                      });
                      const isExcluded = showAllActions && !isIncluded;

                      // T019: Get exclusion reason from exclusionReasons prop
                      const exclusionReason = isExcluded
                        ? exclusionReasons.find((e) => e.action_text === actionText)?.reason
                        : undefined;

                      return (
                        <Tooltip key={index}>
                          <TooltipTrigger asChild>
                            <Card className={`hover-lift border-0 cursor-pointer ${
                              isExcluded ? 'bg-bg-layer-2 opacity-60' : 'bg-bg-layer-3'
                            }`}>
                              <CardContent className="flex items-start gap-3 p-4">
                                <div className={`rounded-full p-1.5 mt-0.5 ${
                                  isExcluded ? 'bg-text-muted/10' : 'bg-primary-2/10'
                                }`}>
                                  <MoveRight className={`h-3.5 w-3.5 ${
                                    isExcluded ? 'text-text-muted' : 'text-primary-2'
                                  }`} aria-hidden="true" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm leading-relaxed text-text-body">{actionText}</p>
                                  {/* Time and Effort Badges */}
                                  <div className="flex flex-wrap items-center gap-2 mt-2">
                                    {/* Exclusion Badge (T018) */}
                                    {isExcluded && exclusionReason && (
                                      <Badge variant="outline" className="bg-destructive-bg/20 text-destructive-text text-xs border-destructive-text/20">
                                        🚫 {exclusionReason}
                                      </Badge>
                                    )}
                                    {!isExcluded && showAllActions && (
                                      <Badge variant="outline" className="bg-success-bg/20 text-success-text text-xs border-success-text/20">
                                        ✅ Included
                                      </Badge>
                                    )}
                                    {estimatedHours && (
                                      <Badge variant="outline" className="flex items-center gap-1 text-xs">
                                        <Clock className="h-3 w-3" />
                                        {estimatedHours}h
                                      </Badge>
                                    )}
                                    {effortLevel && (
                                      <Badge
                                        variant="outline"
                                        className={`flex items-center gap-1 text-xs ${
                                          effortLevel === 'high'
                                            ? 'bg-destructive-bg/30 text-destructive-text'
                                            : 'bg-success-bg/30 text-success-text'
                                        }`}
                                      >
                                        {effortLevel === 'high' ? (
                                          <Flame className="h-3 w-3" />
                                        ) : (
                                          <Check className="h-3 w-3" />
                                        )}
                                        {effortLevel}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </TooltipTrigger>
                          {relevanceScore !== undefined && (
                            <TooltipContent>
                              <p className="text-xs">
                                {Math.round(relevanceScore * 100)}% relevant to your outcome
                              </p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      );
                    })}
                  </TooltipProvider>
                </div>
              )}
            </TabsContent>

            {/* Tasks (LNO) Tab */}
            <TabsContent value="tasks" className="space-y-4 mt-0">
              <div className="mb-4">
                <h3 className="text-base font-semibold mb-2">Task Prioritization (Leverage / Neutral / Overhead)</h3>
                <p className="text-sm text-muted-foreground">Tasks categorized by impact and value</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Leverage Column */}
                <Card className="border-0 overflow-hidden">
                  <div className="h-1 bg-primary-2" />
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary-2" />
                      <span className="text-text-heading">Leverage</span>
                      <Badge variant="default" className="ml-auto border-0">
                        {summary.lno_tasks.leverage.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">High-impact strategic work</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {summary.lno_tasks.leverage.length === 0 ? (
                      <p className="text-xs text-text-muted text-center py-8">
                        No tasks identified
                      </p>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2 pr-2">
                          {summary.lno_tasks.leverage.map((task, index) => (
                            <Card key={index} className="bg-primary-2/5 hover-lift border-0">
                              <CardContent className="p-3">
                                <p className="text-xs leading-relaxed text-text-body">{task}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {/* Neutral Column */}
                <Card className="border-0 overflow-hidden">
                  <div className="h-1 bg-bg-layer-3" />
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-text-body" />
                      <span className="text-text-heading">Neutral</span>
                      <Badge variant="secondary" className="ml-auto border-0">
                        {summary.lno_tasks.neutral.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">Necessary operational tasks</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {summary.lno_tasks.neutral.length === 0 ? (
                      <p className="text-xs text-text-muted text-center py-8">
                        No tasks identified
                      </p>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2 pr-2">
                          {summary.lno_tasks.neutral.map((task, index) => (
                            <Card key={index} className="bg-bg-layer-3 hover-lift border-0">
                              <CardContent className="p-3">
                                <p className="text-xs leading-relaxed text-text-body">{task}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {/* Overhead Column */}
                <Card className="border-0 overflow-hidden">
                  <div className="h-1 bg-destructive-bg" />
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive-text" />
                      <span className="text-text-heading">Overhead</span>
                      <Badge className="ml-auto bg-destructive-bg text-destructive-text border-0">
                        {summary.lno_tasks.overhead.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">Low-value administrative work</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {summary.lno_tasks.overhead.length === 0 ? (
                      <p className="text-xs text-text-muted text-center py-8">
                        No tasks identified
                      </p>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2 pr-2">
                          {summary.lno_tasks.overhead.map((task, index) => (
                            <Card key={index} className="bg-destructive-bg/50 hover-lift border-0">
                              <CardContent className="p-3">
                                <p className="text-xs leading-relaxed text-text-body">{task}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>

          {/* T020: Debug Panel (Development Mode Only) */}
          {process.env.NODE_ENV === 'development' && filteringDecisions && (
            <div className="mt-6">
              <Separator className="mb-4" />
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="debug-panel" className="border-0">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-info-bg/20 p-1.5">
                        <Code className="h-4 w-4 text-info-text" />
                      </div>
                      <span className="text-sm font-semibold text-text-heading">Filtering Debug</span>
                      <Badge variant="outline" className="ml-2">Development</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      {/* Context Snapshot */}
                      <div>
                        <h4 className="text-sm font-semibold text-text-heading mb-2">Context Snapshot</h4>
                        <div className="bg-bg-layer-3 rounded-lg p-3 space-y-1 text-xs font-mono">
                          <div><span className="text-text-muted">Goal:</span> <span className="text-text-body">{filteringDecisions.context.goal}</span></div>
                          <div><span className="text-text-muted">State:</span> <span className="text-text-body">{filteringDecisions.context.state}</span></div>
                          <div><span className="text-text-muted">Capacity:</span> <span className="text-text-body">{filteringDecisions.context.capacity_hours}h</span></div>
                          <div><span className="text-text-muted">Threshold:</span> <span className="text-text-body">{(filteringDecisions.context.threshold * 100).toFixed(0)}%</span></div>
                        </div>
                      </div>

                      {/* Counts and Duration */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-bg-layer-3 rounded-lg p-3">
                          <div className="text-xs text-text-muted mb-1">Total Extracted</div>
                          <div className="text-2xl font-bold text-text-heading">{filteringDecisions.total_actions_extracted}</div>
                        </div>
                        <div className="bg-success-bg/20 rounded-lg p-3">
                          <div className="text-xs text-success-text mb-1">Included</div>
                          <div className="text-2xl font-bold text-success-text">{filteringDecisions.included.length}</div>
                        </div>
                        <div className="bg-destructive-bg/20 rounded-lg p-3">
                          <div className="text-xs text-destructive-text mb-1">Excluded</div>
                          <div className="text-2xl font-bold text-destructive-text">{filteringDecisions.excluded.length}</div>
                        </div>
                        <div className="bg-bg-layer-3 rounded-lg p-3">
                          <div className="text-xs text-text-muted mb-1">Duration</div>
                          <div className="text-2xl font-bold text-text-heading">{filteringDecisions.filtering_duration_ms || 0}ms</div>
                        </div>
                      </div>

                      {/* Actions Table */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-text-heading">All Actions with Scores</h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadFilteringJSON}
                            className="flex items-center gap-1.5"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download JSON
                          </Button>
                        </div>
                        <ScrollArea className="h-[300px]">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="text-left py-2 px-2 text-text-muted font-medium">Status</th>
                                  <th className="text-left py-2 px-2 text-text-muted font-medium">Action</th>
                                  <th className="text-center py-2 px-2 text-text-muted font-medium">Relevance</th>
                                  <th className="text-center py-2 px-2 text-text-muted font-medium">Effort</th>
                                  <th className="text-center py-2 px-2 text-text-muted font-medium">Time</th>
                                  <th className="text-left py-2 px-2 text-text-muted font-medium">Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Included Actions */}
                                {filteringDecisions.included.map((action: ActionWithMetadata, index: number) => (
                                  <tr key={`included-${index}`} className="border-b border-border">
                                    <td className="py-2 px-2">
                                      <Badge variant="outline" className="bg-success-bg/20 text-success-text text-xs border-success-text/20">
                                        ✅
                                      </Badge>
                                    </td>
                                    <td className="py-2 px-2 text-text-body">{action.text}</td>
                                    <td className="py-2 px-2 text-center text-text-body">
                                      {((action.relevance_score || 0) * 100).toFixed(0)}%
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <Badge
                                        variant="outline"
                                        className={`text-xs ${
                                          action.effort_level === 'high'
                                            ? 'bg-destructive-bg/20 text-destructive-text'
                                            : 'bg-success-bg/20 text-success-text'
                                        }`}
                                      >
                                        {action.effort_level}
                                      </Badge>
                                    </td>
                                    <td className="py-2 px-2 text-center text-text-body">
                                      {action.estimated_hours}h
                                    </td>
                                    <td className="py-2 px-2 text-text-muted text-xs">-</td>
                                  </tr>
                                ))}
                                {/* Excluded Actions */}
                                {filteringDecisions.excluded.map((action: FilteringDecisions['excluded'][0], index: number) => (
                                  <tr key={`excluded-${index}`} className="border-b border-border opacity-60">
                                    <td className="py-2 px-2">
                                      <Badge variant="outline" className="bg-destructive-bg/20 text-destructive-text text-xs border-destructive-text/20">
                                        🚫
                                      </Badge>
                                    </td>
                                    <td className="py-2 px-2 text-text-body">{action.text}</td>
                                    <td className="py-2 px-2 text-center text-text-body">
                                      {((action.relevance_score || 0) * 100).toFixed(0)}%
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      {action.effort_level ? (
                                        <Badge
                                          variant="outline"
                                          className={`text-xs ${
                                            action.effort_level === 'high'
                                              ? 'bg-destructive-bg/20 text-destructive-text'
                                              : 'bg-success-bg/20 text-success-text'
                                          }`}
                                        >
                                          {action.effort_level}
                                        </Badge>
                                      ) : (
                                        <span className="text-text-muted">-</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-center text-text-body">
                                      {action.estimated_hours ? `${action.estimated_hours}h` : '-'}
                                    </td>
                                    <td className="py-2 px-2 text-text-muted text-xs">{action.reason}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
