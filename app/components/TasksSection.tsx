'use client';

import { useState } from 'react';
import type { Task, TaskCategory } from '@/app/types';
import TaskCard from './TaskCard';

interface TasksSectionProps {
  tasks: {
    leverage: Task[];
    neutral: Task[];
    overhead: Task[];
  };
  onTasksChange: (tasks: { leverage: Task[]; neutral: Task[]; overhead: Task[] }) => void;
}

const categoryConfig = {
  leverage: {
    title: 'Leverage',
    description: 'High-value, priority tasks',
    color: 'border-green-500/30 bg-green-500/5',
    icon: '🎯'
  },
  neutral: {
    title: 'Neutral',
    description: 'Standard impact tasks',
    color: 'border-gray-500/30 bg-gray-500/5',
    icon: '📋'
  },
  overhead: {
    title: 'Overhead',
    description: 'Low-value, delegate candidates',
    color: 'border-orange-500/30 bg-orange-500/5',
    icon: '⚠️'
  }
};

export default function TasksSection({ tasks, onTasksChange }: TasksSectionProps) {
  const [dragOverCategory, setDragOverCategory] = useState<TaskCategory | null>(null);

  const handleDragOver = (e: React.DragEvent, category: TaskCategory) => {
    e.preventDefault();
    setDragOverCategory(category);
  };

  const handleDragLeave = () => {
    setDragOverCategory(null);
  };

  const handleDrop = (e: React.DragEvent, targetCategory: TaskCategory) => {
    e.preventDefault();
    setDragOverCategory(null);

    const taskId = e.dataTransfer.getData('taskId');
    const sourceCategory = e.dataTransfer.getData('category') as TaskCategory;

    if (!taskId || sourceCategory === targetCategory) return;

    // Find the task in source category
    const taskToMove = tasks[sourceCategory].find(t => t.id === taskId);
    if (!taskToMove) return;

    // Create updated task with new category
    const updatedTask = { ...taskToMove, category: targetCategory };

    // Remove from source and add to target
    const newTasks = {
      leverage: tasks.leverage.filter(t => t.id !== taskId),
      neutral: tasks.neutral.filter(t => t.id !== taskId),
      overhead: tasks.overhead.filter(t => t.id !== taskId)
    };

    newTasks[targetCategory] = [...newTasks[targetCategory], updatedTask];
    onTasksChange(newTasks);
  };

  const totalTasks = tasks.leverage.length + tasks.neutral.length + tasks.overhead.length;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-2xl">✅</div>
        <h2 className="text-xl font-semibold text-gray-100">Tasks (L/N/O)</h2>
        <span className="px-2 py-1 bg-gray-800 text-gray-400 text-xs font-medium rounded-full">
          {totalTasks}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(categoryConfig) as TaskCategory[]).map((category) => {
          const config = categoryConfig[category];
          const categoryTasks = tasks[category];
          const isDragOver = dragOverCategory === category;

          return (
            <div key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-xl">{config.icon}</div>
                <div>
                  <h3 className="font-semibold text-gray-200">{config.title}</h3>
                  <p className="text-xs text-gray-500">{config.description}</p>
                </div>
              </div>

              <div
                onDragOver={(e) => handleDragOver(e, category)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, category)}
                className={`
                  min-h-[250px] space-y-2 p-3 rounded-2xl border-2 border-dashed
                  transition-all duration-200
                  ${isDragOver ? 'border-blue-500 bg-blue-500/10' : config.color}
                `}
              >
                {categoryTasks.length === 0 ? (
                  <div className="flex items-center justify-center h-[230px] text-gray-600 text-sm">
                    <p>Drop tasks here</p>
                  </div>
                ) : (
                  categoryTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
