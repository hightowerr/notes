'use client';

import React, { useState } from 'react';
import { DraftTask } from '@/lib/schemas/taskIntelligence';

interface DraftTaskCardProps {
  draft: DraftTask;
  onEdit: (id: string, newText: string) => void; // Called when user saves edit
  onAccept: (id: string) => void; // Called when user clicks Accept (after optional edit)
  onDismiss: (id: string) => void;
  isEditing?: boolean;
}

export const DraftTaskCard: React.FC<DraftTaskCardProps> = ({ 
  draft, 
  onEdit, 
  onAccept, 
  onDismiss,
  isEditing = false
}) => {
  const [isEditingState, setIsEditingState] = useState(isEditing);
  const [editedText, setEditedText] = useState(draft.task_text);
  const [isChecked, setIsChecked] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const handleSaveEdit = () => {
    onEdit(draft.id, editedText);
    setIsEditingState(false);
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    const result = onAccept(draft.id);
    // Check if the result is a promise and await it if so
    if (result && typeof result.then === 'function') {
      await result;
    }
    setIsAccepting(false);
  };

  const handleCancelEdit = () => {
    setEditedText(draft.task_text);
    setIsEditingState(false);
  };

  const handleDismiss = async () => {
    setIsDismissing(true);
    const result = onDismiss(draft.id);
    // Check if the result is a promise and await it if so
    if (result && typeof result.then === 'function') {
      await result;
    }
    setIsDismissing(false);
  };

  return (
    <div className="border rounded-lg p-4 mb-3 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => setIsChecked(e.target.checked)}
          className="mt-1 mr-3 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div className="flex-1">
          {isEditingState ? (
            <div className="mb-2">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                rows={3}
              />
              <div className="flex space-x-2 mt-2">
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-start">
                <p className="text-gray-800">{draft.task_text}</p>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  draft.source === 'phase10_semantic' 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-purple-100 text-purple-800'
                }`}>
                  {draft.source === 'phase10_semantic' ? '🎯 Semantic Gap' : '🔗 Dependency Gap'}
                </span>
              </div>
              
              <div className="mt-2 text-sm text-gray-600 space-y-1">
                <div className="flex items-center">
                  <span className="font-medium">Hours:</span>
                  <span className="ml-1">{draft.estimated_hours}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-medium">Confidence:</span>
                  <span className="ml-1">{Math.round(draft.confidence_score * 100)}%</span>
                </div>
                <div className="text-gray-500 italic">
                  <span className="font-medium">Why:</span> {draft.reasoning}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex justify-end space-x-2 mt-3">
        {!isEditingState && (
          <button
            onClick={() => setIsEditingState(true)}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Edit
          </button>
        )}
        <button
          onClick={handleDismiss}
          disabled={isDismissing}
          className={`px-3 py-1 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50 ${isDismissing ? 'opacity-50' : ''}`}
        >
          {isDismissing ? 'Dismissing...' : 'Dismiss'}
        </button>
        <button
          onClick={handleAccept}
          disabled={isAccepting}
          className={`px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 ${isAccepting ? 'opacity-50' : ''}`}
        >
          {isAccepting ? 'Accepting...' : '✓ Accept'}
        </button>
      </div>
    </div>
  );
};