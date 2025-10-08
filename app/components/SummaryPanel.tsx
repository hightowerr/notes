'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Lightbulb, CheckCircle2, MoveRight, ListTodo, AlertCircle, Clock } from 'lucide-react';
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
    <div className="animate-in slide-in-from-right duration-500 fade-in">
      <Card className="border-2 border-primary">
        {/* Header */}
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-lg">AI Summary Generated</CardTitle>
              <CardDescription className="mt-1">{filename}</CardDescription>
            </div>
            <div className="flex flex-col gap-2">
              {isLowConfidence && (
                <Badge variant="destructive" className="bg-yellow-600 hover:bg-yellow-700">
                  <AlertCircle className="h-3 w-3" aria-label="Low confidence warning" />
                  Review Required
                </Badge>
              )}
              <Badge variant="secondary" className="flex items-center gap-1">
                <span className="text-xs">Confidence: {confidencePercent}%</span>
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-label="Processing time" />
                <span className="text-xs">{durationInSeconds}s</span>
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Topics Section */}
          <section aria-labelledby="topics-heading">
            <div className="mb-3 flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" aria-label="Topics icon" />
              <h3 id="topics-heading" className="text-base font-semibold">
                Topics
              </h3>
              <Badge variant="secondary" className="ml-auto">
                {summary.topics.length}
              </Badge>
            </div>
            {summary.topics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No topics identified</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {summary.topics.map((topic, index) => (
                  <Badge key={index} variant="outline" className="bg-amber-500/10 border-amber-500/20">
                    {topic}
                  </Badge>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Decisions Section */}
          <section aria-labelledby="decisions-heading">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" aria-label="Decisions icon" />
              <h3 id="decisions-heading" className="text-base font-semibold">
                Decisions
              </h3>
              <Badge variant="secondary" className="ml-auto">
                {summary.decisions.length}
              </Badge>
            </div>
            {summary.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No decisions identified</p>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2 pr-4">
                  {summary.decisions.map((decision, index) => (
                    <Card key={index} className="bg-green-500/5 border-green-500/20">
                      <CardContent className="flex items-start gap-3 p-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
                        <p className="text-sm">{decision}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </section>

          <Separator />

          {/* Actions Section */}
          <section aria-labelledby="actions-heading">
            <div className="mb-3 flex items-center gap-2">
              <MoveRight className="h-5 w-5 text-blue-500" aria-label="Actions icon" />
              <h3 id="actions-heading" className="text-base font-semibold">
                Actions
              </h3>
              <Badge variant="secondary" className="ml-auto">
                {summary.actions.length}
              </Badge>
            </div>
            {summary.actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No actions identified</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {summary.actions.map((action, index) => (
                  <Card key={index} className="bg-blue-500/5 border-blue-500/20">
                    <CardContent className="flex items-start gap-3 p-3">
                      <MoveRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
                      <p className="text-sm">{action}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* LNO Tasks Section */}
          <section aria-labelledby="lno-tasks-heading">
            <div className="mb-4 flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-primary" aria-label="Tasks icon" />
              <h3 id="lno-tasks-heading" className="text-base font-semibold">
                Tasks (L/N/O)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Leverage Column */}
              <div>
                <Card className="border-green-500/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Leverage</span>
                      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                        {summary.lno_tasks.leverage.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">High-impact strategic work</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary.lno_tasks.leverage.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No tasks identified
                      </p>
                    ) : (
                      <ScrollArea className="h-[250px]">
                        <div className="space-y-2 pr-2">
                          {summary.lno_tasks.leverage.map((task, index) => (
                            <Card key={index} className="bg-green-500/10 border-green-500/20">
                              <CardContent className="p-2">
                                <p className="text-xs">{task}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Neutral Column */}
              <div>
                <Card className="border-gray-500/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Neutral</span>
                      <Badge variant="secondary">
                        {summary.lno_tasks.neutral.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">Necessary operational tasks</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary.lno_tasks.neutral.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No tasks identified
                      </p>
                    ) : (
                      <ScrollArea className="h-[250px]">
                        <div className="space-y-2 pr-2">
                          {summary.lno_tasks.neutral.map((task, index) => (
                            <Card key={index} className="bg-accent/50">
                              <CardContent className="p-2">
                                <p className="text-xs">{task}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Overhead Column */}
              <div>
                <Card className="border-orange-500/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Overhead</span>
                      <Badge variant="destructive" className="bg-orange-600 hover:bg-orange-700">
                        {summary.lno_tasks.overhead.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">Low-value administrative work</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary.lno_tasks.overhead.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No tasks identified
                      </p>
                    ) : (
                      <ScrollArea className="h-[250px]">
                        <div className="space-y-2 pr-2">
                          {summary.lno_tasks.overhead.map((task, index) => (
                            <Card key={index} className="bg-orange-500/10 border-orange-500/20">
                              <CardContent className="p-2">
                                <p className="text-xs">{task}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
