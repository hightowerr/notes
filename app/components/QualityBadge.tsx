'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';

interface QualityBadgeProps {
  clarityScore?: number | null;
  className?: string;
  isLoading?: boolean;
  isRecalculating?: boolean;
}

const QualityBadge: React.FC<QualityBadgeProps> = ({ 
  clarityScore, 
  className = '',
  isLoading = false,
  isRecalculating = false
}) => {
  let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
  let badgeText = '';
  let badgeBg = '';
  const hasScore = typeof clarityScore === 'number' && !Number.isNaN(clarityScore);

  if (!hasScore) {
    badgeVariant = 'outline';
    badgeText = isLoading ? '...' : 'Pending';
    badgeBg = 'bg-muted text-muted-foreground';
  } else if ((clarityScore as number) >= 0.8) {
    // Green: Clear
    badgeVariant = 'secondary';
    badgeText = 'Clear';
    badgeBg = 'bg-green-100 text-green-800';
  } else if ((clarityScore as number) >= 0.5) {
    // Yellow: Review
    badgeVariant = 'secondary';
    badgeText = 'Review';
    badgeBg = 'bg-yellow-100 text-yellow-800';
  } else {
    // Red: Needs Work
    badgeVariant = 'destructive';
    badgeText = 'Needs Work';
    badgeBg = 'bg-red-100 text-red-800';
  }

  // Add pulsing animation if recalculating
  const recalculatingClass = isRecalculating ? 'animate-pulse' : '';

  return (
    <Badge 
      variant={badgeVariant} 
      className={`${badgeBg} ${recalculatingClass} ${className} transition-all duration-300`}
    >
      {isLoading && hasScore ? '...' : badgeText}
    </Badge>
  );
};

export default QualityBadge;
