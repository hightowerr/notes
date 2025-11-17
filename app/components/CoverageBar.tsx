'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface CoverageBarProps {
  coveragePercentage: number;
  missingAreas: string[];
  onGenerateDraftsClick?: () => void;
  isLoading?: boolean;
  taskCount?: number;
}

const CoverageBar: React.FC<CoverageBarProps> = ({ 
  coveragePercentage, 
  missingAreas, 
  onGenerateDraftsClick,
  isLoading = false,
  taskCount,
}) => {
  // Determine color based on coverage percentage
  const getCoverageColor = () => {
    if (coveragePercentage < 70) return 'bg-red-500';
    if (coveragePercentage < 85) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Determine text color for percentage
  const getTextColor = () => {
    if (coveragePercentage < 70) return 'text-red-700';
    if (coveragePercentage < 85) return 'text-yellow-700';
    return 'text-green-700';
  };

  const showLowTaskWarning = typeof taskCount === 'number' && taskCount > 0 && taskCount < 5;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Goal Coverage Analysis</span>
          <span className={`text-lg font-bold ${getTextColor()}`}>
            {coveragePercentage}%
          </span>
        </CardTitle>
        <CardDescription>
          How well your tasks align with your outcome goal
        </CardDescription>
        {showLowTaskWarning && (
          <div className="mt-2 flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span>Coverage analysis requires ≥5 tasks for accuracy.</span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div
            className="w-full bg-gray-200 rounded-full h-4"
            role="progressbar"
            aria-valuenow={coveragePercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Goal coverage: ${coveragePercentage}%`}
          >
            <div
              className={`h-4 rounded-full ${getCoverageColor()} transition-all duration-500 ease-in-out`}
              style={{ width: `${coveragePercentage}%` }}
            ></div>
          </div>
        </div>

        {missingAreas && missingAreas.length > 0 && (
          <div className="mb-4">
            <h3 className="font-medium mb-2">Missing Areas:</h3>
            <div className="flex flex-wrap gap-2">
              {missingAreas.map((area, index) => (
                <Badge key={index} variant="secondary" className="bg-yellow-100 text-yellow-800">
                  {area}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {coveragePercentage < 70 && onGenerateDraftsClick && (
          <button
            onClick={onGenerateDraftsClick}
            disabled={isLoading}
            className={`w-full py-2 px-4 rounded-md text-white font-medium ${
              isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Generating Draft Tasks...' : 'Generate Draft Tasks'}
          </button>
        )}
      </CardContent>
    </Card>
  );
};

export default CoverageBar;
