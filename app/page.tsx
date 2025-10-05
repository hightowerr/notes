'use client';

import { useState } from 'react';
import type { NotesData, Task } from '@/app/types';
import FileUploadSection from '@/app/components/FileUploadSection';
import TopicsSection from '@/app/components/TopicsSection';
import DecisionsSection from '@/app/components/DecisionsSection';
import ActionsSection from '@/app/components/ActionsSection';
import TasksSection from '@/app/components/TasksSection';

// Mock data for demonstration
const initialData: NotesData = {
  files: [
    {
      id: '1',
      name: 'Q4-strategy-meeting.pdf',
      size: 245000,
      uploadedAt: Date.now() - 3600000
    },
    {
      id: '2',
      name: 'product-roadmap-notes.docx',
      size: 156000,
      uploadedAt: Date.now() - 7200000
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

  const handleFilesAdded = (files: File[]) => {
    // Simulate file upload and processing
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

    // In a real app, this would trigger AI processing
    console.log('Files uploaded:', files);
  };

  const handleTasksChange = (tasks: { leverage: Task[]; neutral: Task[]; overhead: Task[] }) => {
    setData((prev) => ({
      ...prev,
      tasks
    }));
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#1a1a1a]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">📝</div>
              <div>
                <h1 className="text-2xl font-bold text-gray-100">AI Note Synthesiser</h1>
                <p className="text-sm text-gray-500">
                  Autonomous document analysis and structured insights
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="px-4 py-2 bg-blue-500/10 text-blue-400 text-sm font-medium rounded-full border border-blue-500/30">
                {data.files.length} Documents Processed
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* File Upload Section */}
        <FileUploadSection files={data.files} onFilesAdded={handleFilesAdded} />

        {/* Two-column layout for Topics and Decisions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopicsSection
            topics={data.topics}
            onTopicsChange={(topics) => setData((prev) => ({ ...prev, topics }))}
          />
          <DecisionsSection
            decisions={data.decisions}
            onDecisionsChange={(decisions) => setData((prev) => ({ ...prev, decisions }))}
          />
        </div>

        {/* Actions Section */}
        <ActionsSection
          actions={data.actions}
          onActionsChange={(actions) => setData((prev) => ({ ...prev, actions }))}
        />

        {/* Tasks Section with L/N/O categorization */}
        <TasksSection tasks={data.tasks} onTasksChange={handleTasksChange} />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-sm text-gray-600">
          <p>AI Note Synthesiser - Powered by Next.js 15, React 19, and TypeScript</p>
        </div>
      </footer>
    </div>
  );
}
