'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Lightbulb, CheckCircle2, MoveRight, ListTodo, AlertCircle, Clock, TrendingUp, Activity, AlertTriangle, Download } from 'lucide-react';
import type { DocumentOutput } from '@/lib/schemas';
import { useState } from 'react';
import { toast } from 'sonner';

interface SummaryPanelProps {
  summary: DocumentOutput;
  confidence: number;
  filename: string;
  processingDuration: number;
  fileId: string;
}

export default function SummaryPanel({
  summary,
  confidence,
  filename,
  processingDuration,
  fileId,
}: SummaryPanelProps) {
  const isLowConfidence = confidence < 0.8;
  const durationInSeconds = (processingDuration / 1000).toFixed(1);
  const confidencePercent = Math.round(confidence * 100);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

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
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-full bg-primary-2/10 p-2">
                  <MoveRight className="h-4 w-4 text-primary-2" aria-label="Actions icon" />
                </div>
                <h3 className="text-base font-semibold text-text-heading">
                  Action Items
                </h3>
                <Badge variant="secondary" className="ml-auto">
                  {summary.actions.length}
                </Badge>
              </div>
              {summary.actions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No actions identified</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {summary.actions.map((action, index) => (
                    <Card key={index} className="bg-bg-layer-3 hover-lift border-0">
                      <CardContent className="flex items-start gap-3 p-4">
                        <div className="rounded-full bg-primary-2/10 p-1.5 mt-0.5">
                          <MoveRight className="h-3.5 w-3.5 text-primary-2" aria-hidden="true" />
                        </div>
                        <p className="text-sm leading-relaxed text-text-body">{action}</p>
                      </CardContent>
                    </Card>
                  ))}
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
        </CardContent>
      </Card>
    </div>
  );
}
