'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Lightbulb, CheckCircle2, MoveRight, ListTodo, AlertCircle, Clock, TrendingUp, Activity, AlertTriangle } from 'lucide-react';
import type { DocumentOutput } from '@/lib/schemas';

interface SummaryPanelProps {
  summary: DocumentOutput;
  confidence: number;
  filename: string;
  processingDuration: number;
}

export default function SummaryPanel({
  summary,
  confidence,
  filename,
  processingDuration,
}: SummaryPanelProps) {
  const isLowConfidence = confidence < 0.8;
  const durationInSeconds = (processingDuration / 1000).toFixed(1);
  const confidencePercent = Math.round(confidence * 100);

  return (
    <div className="animate-in slide-in-from-bottom duration-500 fade-in">
      <Card className="overflow-hidden elevation-4 hover-lift">
        <div className="h-2 gradient-primary" />
        {/* Header */}
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded-full bg-primary/10 p-2">
                  <ListTodo className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-xl">AI Summary</CardTitle>
              </div>
              <CardDescription className="text-base">{filename}</CardDescription>
            </div>
            <div className="flex flex-col gap-2">
              {isLowConfidence && (
                <Badge variant="outline" className="border-warning text-warning flex items-center gap-1.5 px-3 py-1">
                  <AlertCircle className="h-3.5 w-3.5" aria-label="Low confidence warning" />
                  Review Required
                </Badge>
              )}
              <div className="flex flex-col gap-1 rounded-lg bg-muted p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">Confidence</span>
                  <span className="text-sm font-bold">{confidencePercent}%</span>
                </div>
                <Progress value={confidence * 100} className="h-1.5" />
              </div>
              <Badge variant="outline" className="flex items-center gap-1.5 justify-center px-3 py-1">
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
                  <div className="rounded-full bg-primary/10 p-2">
                    <Lightbulb className="h-4 w-4 text-primary" aria-label="Topics icon" />
                  </div>
                  <h3 id="topics-heading" className="text-base font-semibold">
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
                  <div className="rounded-full bg-primary/10 p-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Decisions icon" />
                  </div>
                  <h3 id="decisions-heading" className="text-base font-semibold">
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
                      <Card key={index} className="bg-accent/50 hover-lift">
                        <CardContent className="flex items-start gap-3 p-4">
                          <div className="rounded-full bg-primary/10 p-1.5 mt-0.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                          </div>
                          <p className="text-sm leading-relaxed">{decision}</p>
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
                <div className="rounded-full bg-primary/10 p-2">
                  <MoveRight className="h-4 w-4 text-primary" aria-label="Actions icon" />
                </div>
                <h3 className="text-base font-semibold">
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
                    <Card key={index} className="bg-muted/50 hover-lift">
                      <CardContent className="flex items-start gap-3 p-4">
                        <div className="rounded-full bg-primary/10 p-1.5 mt-0.5">
                          <MoveRight className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        </div>
                        <p className="text-sm leading-relaxed">{action}</p>
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
                <Card className="border-primary/50 overflow-hidden">
                  <div className="h-1 bg-primary" />
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span>Leverage</span>
                      <Badge variant="default" className="ml-auto">
                        {summary.lno_tasks.leverage.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">High-impact strategic work</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {summary.lno_tasks.leverage.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        No tasks identified
                      </p>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2 pr-2">
                          {summary.lno_tasks.leverage.map((task, index) => (
                            <Card key={index} className="bg-primary/5 hover-lift">
                              <CardContent className="p-3">
                                <p className="text-xs leading-relaxed">{task}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {/* Neutral Column */}
                <Card className="border-muted-foreground/30 overflow-hidden">
                  <div className="h-1 bg-muted-foreground/30" />
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      <span>Neutral</span>
                      <Badge variant="secondary" className="ml-auto">
                        {summary.lno_tasks.neutral.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">Necessary operational tasks</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {summary.lno_tasks.neutral.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        No tasks identified
                      </p>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2 pr-2">
                          {summary.lno_tasks.neutral.map((task, index) => (
                            <Card key={index} className="bg-muted/50 hover-lift">
                              <CardContent className="p-3">
                                <p className="text-xs leading-relaxed">{task}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {/* Overhead Column */}
                <Card className="border-destructive/30 overflow-hidden">
                  <div className="h-1 bg-destructive/50" />
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span>Overhead</span>
                      <Badge variant="destructive" className="ml-auto">
                        {summary.lno_tasks.overhead.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">Low-value administrative work</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {summary.lno_tasks.overhead.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        No tasks identified
                      </p>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2 pr-2">
                          {summary.lno_tasks.overhead.map((task, index) => (
                            <Card key={index} className="bg-destructive/5 hover-lift">
                              <CardContent className="p-3">
                                <p className="text-xs leading-relaxed">{task}</p>
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
