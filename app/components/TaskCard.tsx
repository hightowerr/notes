'use client';

import { useState } from 'react';
import type { Task, TaskCategory } from '@/app/types';

interface TaskCardProps {
  task: Task;
  onDragStart?: (id: string, category: TaskCategory) => void;
  onDragEnd?: () => void;
}

const categoryConfig = {
  leverage: {
    label: 'L',
    color: 'bg-green-500/10 text-green-400 border-green-500/30',
    icon: '🎯'
  },
  neutral: {
    label: 'N',
    color: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
    icon: '📋'
  },
  overhead: {
    label: 'O',
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    icon: '⚠️'
  }
};

export default function TaskCard({ task, onDragStart, onDragEnd }: TaskCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const config = categoryConfig[task.category];

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.setData('category', task.category);
    if (onDragStart) onDragStart(task.id, task.category);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (onDragEnd) onDragEnd();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`
        bg-[#252525] border border-gray-800 rounded-xl p-4
        hover:bg-[#2a2a2a] hover:border-gray-700
        transition-all duration-200 cursor-move
        ${isDragging ? 'opacity-50' : 'opacity-100'}
      `}
      role="article"
      aria-label={`${task.category} task: ${task.text}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-xl flex-shrink-0">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-200 leading-relaxed">{task.text}</p>
        </div>
        <span className={`
          px-2 py-1 text-xs font-medium rounded-full border flex-shrink-0
          ${config.color}
        `}>
          {config.label}
        </span>
      </div>
    </div>
  );
}
