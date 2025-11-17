import React from 'react';

interface PulseAnimationProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const PulseAnimation: React.FC<PulseAnimationProps> = ({ 
  className = '', 
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  return (
    <div className={`relative inline-flex ${sizeClasses[size]} ${className}`}>
      <div className="absolute h-full w-full rounded-full bg-blue-500 opacity-75 animate-ping"></div>
      <div className="relative h-full w-full rounded-full bg-blue-600"></div>
    </div>
  );
};

export default PulseAnimation;