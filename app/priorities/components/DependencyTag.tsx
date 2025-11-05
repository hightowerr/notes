'use client';

import type { MouseEvent } from 'react';

type DependencyTagProps = {
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
};

export function DependencyTag({ label, onClick }: DependencyTagProps) {
  const content = `· ${label}`;

  if (!onClick) {
    return <span className="text-xs text-muted-foreground">{content}</span>;
  }

  return (
    <button
      type="button"
      className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={event => {
        event.stopPropagation();
        onClick(event);
      }}
    >
      {content}
    </button>
  );
}
