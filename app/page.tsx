'use client';

import { useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileText, Lightbulb, CheckCircle2, ListTodo, MoveRight } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

// Type definitions
type TaskCategory = 'leverage' | 'neutral' | 'overhead';

interface Task {
  id: string;
  text: string;
  category: TaskCategory;
}

interface NotesData {
  files: Array<{
    id: string;
    name: string;
    size: number;
    uploadedAt: number;
  }>;
  topics: Array<{
    id: string;
    text: string;
  }>;
  decisions: Array<{
    id: string;
    text: string;
    context?: string;
  }>;
  actions: Array<{
    id: string;
    text: string;
  }>;
  tasks: {
    leverage: Task[];
    neutral: Task[];
    overhead: Task[];
  };
}

// Mock data for demonstration
const initialData: NotesData = {
  files: [
    {
      id: '1',
      name: 'Q4-strategy-meeting.pdf',
      size: 245000,
      uploadedAt: 1728198000000 // Static timestamp: Oct 6, 2024, 5:00 AM
    },
    {
      id: '2',
      name: 'product-roadmap-notes.docx',
      size: 156000,
      uploadedAt: 1728194400000 // Static timestamp: Oct 6, 2024, 4:00 AM
    }
  ],
  topics: [
    { id: 't1', text: 'Q4 Product Roadmap Planning' },
    { id: 't2', text: 'Team Hiring Strategy for Engineering' },
    { id: 't3', text: 'Customer Feedback Analysis' },
    { id: 't4', text: 'Budget Allocation for Next Quarter' }
  ],
  decisions: [
    {
      id: 'd1',
      text: 'Proceed with mobile-first redesign',
      context: 'Approved by leadership team after user research presentation'
    },
    {
      id: 'd2',
      text: 'Hire 3 senior engineers by end of Q4',
      context: 'Budget approved, recruitment process to start immediately'
    },
    {
      id: 'd3',
      text: 'Sunset legacy API v1 by March 2026'
    }
  ],
  actions: [
    { id: 'a1', text: 'Schedule design review session with UX team' },
    { id: 'a2', text: 'Draft job descriptions for engineering roles' },
    { id: 'a3', text: 'Send migration guide to API v1 customers' },
    { id: 'a4', text: 'Set up weekly sync with product team' }
  ],
  tasks: {
    leverage: [
      {
        id: 'tl1',
        text: 'Complete competitive analysis for new feature set',
        category: 'leverage'
      },
      {
        id: 'tl2',
        text: 'Define metrics for success in Q4 initiatives',
        category: 'leverage'
      },
      {
        id: 'tl3',
        text: 'Create technical architecture proposal for redesign',
        category: 'leverage'
      }
    ],
    neutral: [
      {
        id: 'tn1',
        text: 'Update project documentation with latest decisions',
        category: 'neutral'
      },
      {
        id: 'tn2',
        text: 'Schedule team onboarding sessions',
        category: 'neutral'
      },
      {
        id: 'tn3',
        text: 'Review and approve pending pull requests',
        category: 'neutral'
      }
    ],
    overhead: [
      {
        id: 'to1',
        text: 'File expense reports for last quarter',
        category: 'overhead'
      },
      {
        id: 'to2',
        text: 'Update Slack channel descriptions',
        category: 'overhead'
      },
      {
        id: 'to3',
        text: 'Organize team drive folders',
        category: 'overhead'
      }
    ]
  }
};

export default function Home() {
  const [data, setData] = useState<NotesData>(initialData);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      handleFilesAdded(droppedFiles);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      handleFilesAdded(selectedFiles);
    }
  };

  const handleFilesAdded = (files: File[]) => {
    const newFiles = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      uploadedAt: Date.now()
    }));

    setData((prev) => ({
      ...prev,
      files: [...prev.files, ...newFiles]
    }));

    console.log('Files uploaded:', files);
  };

  // Task drag and drop handlers
  const handleTaskDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const handleTaskDragEnd = () => {
    setDraggedTask(null);
  };

  const handleTaskDrop = (targetCategory: TaskCategory) => {
    if (!draggedTask) return;

    const sourceCategory = draggedTask.category;
    if (sourceCategory === targetCategory) return;

    // Remove from source
    const updatedSourceTasks = data.tasks[sourceCategory].filter(
      (t) => t.id !== draggedTask.id
    );

    // Add to target
    const updatedTask = { ...draggedTask, category: targetCategory };
    const updatedTargetTasks = [...data.tasks[targetCategory], updatedTask];

    setData((prev) => ({
      ...prev,
      tasks: {
        ...prev.tasks,
        [sourceCategory]: updatedSourceTasks,
        [targetCategory]: updatedTargetTasks
      }
    }));

    setDraggedTask(null);
  };

  // Helper functions
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">AI Note Synthesiser</h1>
                <p className="text-sm text-muted-foreground">
                  Autonomous document analysis and structured insights
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="px-4 py-2">
                {data.files.length} Documents Processed
              </Badge>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* File Upload Section */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <Upload className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-semibold">Documents & Files</h2>
          </div>

          <Card
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent/50'
            }`}
          >
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                aria-label="File input"
              />
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">
                  {isDragging ? 'Drop files here' : 'Drag & drop files or click to browse'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports PDF, DOCX, TXT files
                </p>
              </div>
            </CardContent>
          </Card>

          {data.files.length > 0 && (
            <div className="mt-4 space-y-2">
              {data.files.map((file) => (
                <Card key={file.id} className="transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatFileSize(file.size)} • {formatDate(file.uploadedAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                      Processed
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* Topics and Decisions - Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Topics Section */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <Lightbulb className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-semibold">Topics</h2>
              <Badge variant="secondary">{data.topics.length}</Badge>
            </div>

            <Card>
              <CardContent className="p-4">
                <ScrollArea className="h-[300px]">
                  {data.topics.length === 0 ? (
                    <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                      <p>No topics yet. Upload a document to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.topics.map((topic) => (
                        <Card key={topic.id} className="bg-accent/30">
                          <CardContent className="flex items-start gap-3 p-3">
                            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                            <p className="text-sm">{topic.text}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </section>

          {/* Decisions Section */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-semibold">Decisions</h2>
              <Badge variant="secondary">{data.decisions.length}</Badge>
            </div>

            <Card>
              <CardContent className="p-4">
                <ScrollArea className="h-[300px]">
                  {data.decisions.length === 0 ? (
                    <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                      <p>No decisions yet. Upload a document to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.decisions.map((decision) => (
                        <Card key={decision.id} className="bg-accent/30">
                          <CardContent className="p-3">
                            <div className="flex items-start gap-3">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                              <div className="space-y-1">
                                <p className="text-sm font-medium">{decision.text}</p>
                                {decision.context && (
                                  <p className="text-xs text-muted-foreground">{decision.context}</p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </section>
        </div>

        <Separator />

        {/* Actions Section */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <MoveRight className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-semibold">Actions</h2>
            <Badge variant="secondary">{data.actions.length}</Badge>
          </div>

          <Card>
            <CardContent className="p-4">
              {data.actions.length === 0 ? (
                <div className="flex h-[100px] items-center justify-center text-muted-foreground">
                  <p>No actions yet. Upload a document to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {data.actions.map((action) => (
                    <Card key={action.id} className="bg-accent/30">
                      <CardContent className="flex items-start gap-3 p-3">
                        <MoveRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                        <p className="text-sm">{action.text}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Tasks Section - L/N/O */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <ListTodo className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-semibold">Tasks (L/N/O)</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Leverage Column */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleTaskDrop('leverage')}
            >
              <Card className={draggedTask?.category !== 'leverage' ? 'border-green-500/50' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="text-base">Leverage</span>
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                      {data.tasks.leverage.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    High-impact strategic work
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {data.tasks.leverage.map((task) => (
                        <Card
                          key={task.id}
                          draggable
                          onDragStart={() => handleTaskDragStart(task)}
                          onDragEnd={handleTaskDragEnd}
                          className={`cursor-move bg-green-500/10 border-green-500/20 transition-opacity ${
                            draggedTask?.id === task.id ? 'opacity-50' : ''
                          }`}
                        >
                          <CardContent className="p-3">
                            <p className="text-sm">{task.text}</p>
                          </CardContent>
                        </Card>
                      ))}
                      {data.tasks.leverage.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-8">
                          Drag tasks here
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Neutral Column */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleTaskDrop('neutral')}
            >
              <Card className={draggedTask?.category !== 'neutral' ? 'border-gray-500/50' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="text-base">Neutral</span>
                    <Badge variant="secondary">
                      {data.tasks.neutral.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Necessary operational tasks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {data.tasks.neutral.map((task) => (
                        <Card
                          key={task.id}
                          draggable
                          onDragStart={() => handleTaskDragStart(task)}
                          onDragEnd={handleTaskDragEnd}
                          className={`cursor-move bg-accent/50 transition-opacity ${
                            draggedTask?.id === task.id ? 'opacity-50' : ''
                          }`}
                        >
                          <CardContent className="p-3">
                            <p className="text-sm">{task.text}</p>
                          </CardContent>
                        </Card>
                      ))}
                      {data.tasks.neutral.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-8">
                          Drag tasks here
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Overhead Column */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleTaskDrop('overhead')}
            >
              <Card className={draggedTask?.category !== 'overhead' ? 'border-orange-500/50' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="text-base">Overhead</span>
                    <Badge variant="destructive" className="bg-orange-600 hover:bg-orange-700">
                      {data.tasks.overhead.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Low-value administrative work
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {data.tasks.overhead.map((task) => (
                        <Card
                          key={task.id}
                          draggable
                          onDragStart={() => handleTaskDragStart(task)}
                          onDragEnd={handleTaskDragEnd}
                          className={`cursor-move bg-orange-500/10 border-orange-500/20 transition-opacity ${
                            draggedTask?.id === task.id ? 'opacity-50' : ''
                          }`}
                        >
                          <CardContent className="p-3">
                            <p className="text-sm">{task.text}</p>
                          </CardContent>
                        </Card>
                      ))}
                      {data.tasks.overhead.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-8">
                          Drag tasks here
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t">
        <div className="mx-auto max-w-7xl px-6 py-6 text-center text-sm text-muted-foreground">
          <p>AI Note Synthesiser - Powered by Next.js 15, React 19, and TypeScript</p>
        </div>
      </footer>
    </div>
  );
}
