'use client';

import { useState } from 'react';

interface DraggableCardProps {
  id: string;
  text: string;
  context?: string;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  className?: string;
  icon?: string;
}

export default function DraggableCard({
  id,
  text,
  context,
  onDragStart,
  onDragEnd,
  className = '',
  icon = '📝'
}: DraggableCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    if (onDragStart) onDragStart(id);
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
        ${className}
      `}
      role="article"
      aria-label={text}
    >
      <div className="flex items-start gap-3">
        <div className="text-xl flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-200 leading-relaxed">{text}</p>
          {context && (
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{context}</p>
          )}
        </div>
      </div>
    </div>
  );
}
