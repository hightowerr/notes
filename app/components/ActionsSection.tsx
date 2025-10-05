'use client';

import { useState } from 'react';
import type { Action } from '@/app/types';
import DraggableCard from './DraggableCard';

interface ActionsSectionProps {
  actions: Action[];
  onActionsChange: (actions: Action[]) => void;
}

export default function ActionsSection({ actions, onActionsChange }: ActionsSectionProps) {
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
        <div className="text-2xl">⚡</div>
        <h2 className="text-xl font-semibold text-gray-100">Actions</h2>
        <span className="px-2 py-1 bg-gray-800 text-gray-400 text-xs font-medium rounded-full">
          {actions.length}
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
        {actions.length === 0 ? (
          <div className="flex items-center justify-center h-[180px] text-gray-600">
            <p>No actions yet. Upload a document to get started.</p>
          </div>
        ) : (
          actions.map((action) => (
            <DraggableCard
              key={action.id}
              id={action.id}
              text={action.text}
              icon="⚡"
            />
          ))
        )}
      </div>
    </section>
  );
}
