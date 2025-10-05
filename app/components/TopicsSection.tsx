'use client';

import { useState } from 'react';
import type { Topic } from '@/app/types';
import DraggableCard from './DraggableCard';

interface TopicsSectionProps {
  topics: Topic[];
  onTopicsChange: (topics: Topic[]) => void;
}

export default function TopicsSection({ topics, onTopicsChange }: TopicsSectionProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // Handle drop logic here if needed
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-2xl">💡</div>
        <h2 className="text-xl font-semibold text-gray-100">Topics</h2>
        <span className="px-2 py-1 bg-gray-800 text-gray-400 text-xs font-medium rounded-full">
          {topics.length}
        </span>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          min-h-[200px] space-y-3 p-4 rounded-2xl border-2 border-dashed
          transition-colors duration-200
          ${isDragOver ? 'border-blue-500 bg-blue-500/5' : 'border-transparent'}
        `}
      >
        {topics.length === 0 ? (
          <div className="flex items-center justify-center h-[180px] text-gray-600">
            <p>No topics yet. Upload a document to get started.</p>
          </div>
        ) : (
          topics.map((topic) => (
            <DraggableCard
              key={topic.id}
              id={topic.id}
              text={topic.text}
              icon="💡"
            />
          ))
        )}
      </div>
    </section>
  );
}
