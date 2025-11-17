'use client';

import React, { useState, useEffect } from 'react';
import type {
  QualityRefinementOutput,
  RefinementAction,
} from '@/lib/services/qualityRefinement';

interface RefinementModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalTaskId: string;
  originalTaskText: string;
  onApplyRefinement: (payload: {
    taskId: string;
    suggestionId: string;
    newTaskTexts: string[];
    action: RefinementAction;
  }) => void;
}

export const RefinementModal: React.FC<RefinementModalProps> = ({
  isOpen,
  onClose,
  originalTaskId,
  originalTaskText,
  onApplyRefinement,
}) => {
  const [refinementSuggestions, setRefinementSuggestions] = useState<QualityRefinementOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && originalTaskId) {
      loadRefinementSuggestions();
    }
  }, [isOpen, originalTaskId]);

  const loadRefinementSuggestions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/tasks/${originalTaskId}/refine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task_id: originalTaskId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get refinement suggestions: ${response.status}`);
      }

      const data = await response.json();
      setRefinementSuggestions(data);
    } catch (err) {
      console.error('Error loading refinement suggestions:', err);
      setError('Failed to load refinement suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyRefinement = () => {
    if (selectedSuggestionIndex === null || !refinementSuggestions) return;

    const selectedSuggestion = refinementSuggestions.suggestions[selectedSuggestionIndex];
    onApplyRefinement({
      taskId: originalTaskId,
      suggestionId: selectedSuggestion.suggestion_id,
      newTaskTexts: selectedSuggestion.new_task_texts,
      action: selectedSuggestion.action,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">🔧 Task Refinement Suggestions</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="mb-4">
            <h3 className="font-medium text-gray-700 mb-2">Original Task:</h3>
            <div className="bg-gray-50 p-3 rounded border">
              {originalTaskText}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-500 mb-4">{error}</div>
              <button
                onClick={loadRefinementSuggestions}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Retry
              </button>
            </div>
          ) : refinementSuggestions && refinementSuggestions.suggestions.length > 0 ? (
            <>
              <div className="mb-4">
                <h3 className="font-medium text-gray-700 mb-2">Refinement Options:</h3>
                
                {refinementSuggestions.suggestions.map((suggestion, index) => (
                  <div 
                    key={suggestion.suggestion_id}
                    className={`border rounded-lg p-4 mb-3 cursor-pointer transition ${
                      selectedSuggestionIndex === index 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedSuggestionIndex(index)}
                  >
                    <div className="flex items-start">
                      <div className={`mr-3 mt-1 h-4 w-4 rounded-full border flex items-center justify-center ${
                        selectedSuggestionIndex === index 
                          ? 'border-blue-500 bg-blue-500' 
                          : 'border-gray-400'
                      }`}>
                        {selectedSuggestionIndex === index && (
                          <div className="w-2 h-2 rounded-full bg-white"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <span className="font-medium capitalize">{suggestion.action}</span>
                          <span className="text-xs px-2 py-1 bg-gray-100 rounded-full">
                            {suggestion.action === 'split' ? 'SplitOptions' : 
                             suggestion.action === 'merge' ? 'MergeOption' : 'RephraseOption'}
                          </span>
                        </div>
                        
                        <div className="mt-2 space-y-2">
                          {suggestion.action === 'split' && (
                            <div>
                              <p className="text-gray-600 text-sm">Split into {suggestion.new_task_texts.length} tasks:</p>
                              <ul className="mt-2 space-y-1">
                                {suggestion.new_task_texts.map((taskText, idx) => (
                                  <li key={idx} className="text-gray-800 bg-gray-50 p-2 rounded text-sm">
                                    {idx + 1}. {taskText}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {suggestion.action === 'rephrase' && (
                            <div>
                              <p className="text-gray-600 text-sm">Rephrased task:</p>
                              <p className="text-gray-800 bg-gray-50 p-2 rounded text-sm mt-1">
                                {suggestion.new_task_texts[0]}
                              </p>
                            </div>
                          )}
                          
                          {suggestion.action === 'merge' && (
                            <div>
                              <p className="text-gray-600 text-sm">Merge with tasks:</p>
                              <ul className="mt-2 space-y-1">
                                {suggestion.new_task_texts.map((taskText, idx) => (
                                  <li key={idx} className="text-gray-800 bg-gray-50 p-2 rounded text-sm">
                                    {taskText}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          <p className="text-gray-600 text-sm italic mt-2">
                            <span className="font-medium">Reasoning:</span> {suggestion.reasoning}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyRefinement}
                  disabled={selectedSuggestionIndex === null}
                  className={`px-4 py-2 rounded-md ${
                    selectedSuggestionIndex !== null
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Apply Refinement
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No refinement suggestions available for this task.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
