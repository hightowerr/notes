'use client';

import React, { useState, ReactNode } from 'react';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

interface QualityTooltipProps {
  children: ReactNode;
  qualityMetadata: {
    clarity_score: number;
    verb_strength: 'strong' | 'weak';
    specificity_indicators: {
      has_metrics: boolean;
      has_acceptance_criteria: boolean;
      contains_numbers: boolean;
    };
    improvement_suggestions: string[];
    calculation_method: 'ai' | 'heuristic';
  };
  onRefineClick?: () => void;
}

const QualityTooltip: React.FC<QualityTooltipProps> = ({ 
  children, 
  qualityMetadata,
  onRefineClick 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent className="w-80 max-w-md p-4 bg-white border border-gray-200 shadow-lg rounded-md">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-bold">Quality Breakdown</h4>
              <span className={`font-mono font-bold ${getScoreColor(qualityMetadata.clarity_score)}`}>
                {(qualityMetadata.clarity_score * 100).toFixed(0)}%
              </span>
            </div>

            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span>Verb Strength:</span>
                <span className={qualityMetadata.verb_strength === 'strong' ? 'text-green-600' : 'text-red-600'}>
                  {qualityMetadata.verb_strength}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>Has Metrics:</span>
                <span>{qualityMetadata.specificity_indicators.has_metrics ? 'Yes' : 'No'}</span>
              </div>
              
              <div className="flex justify-between">
                <span>Has Numbers:</span>
                <span>{qualityMetadata.specificity_indicators.contains_numbers ? 'Yes' : 'No'}</span>
              </div>
              
              <div className="flex justify-between">
                <span>Calculated With:</span>
                <span className="capitalize">{qualityMetadata.calculation_method}</span>
              </div>
            </div>

            {qualityMetadata.improvement_suggestions && qualityMetadata.improvement_suggestions.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <h5 className="font-medium mb-1">Suggestions:</h5>
                <ul className="text-xs space-y-1">
                  {qualityMetadata.improvement_suggestions.map((suggestion, index) => (
                    <li key={index} className="flex items-start">
                      <span className="mr-1">•</span>
                      <span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(qualityMetadata.clarity_score < 0.8 && onRefineClick) && (
              <div className="pt-3 border-t border-gray-100">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefineClick();
                    setIsOpen(false);
                  }}
                >
                  Refine This Task
                </Button>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default QualityTooltip;