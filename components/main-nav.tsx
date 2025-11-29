'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type MainNavProps = {
  actions?: ReactNode;
};

const NAV_ITEMS = [
  { href: '/', label: 'Upload' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/priorities', label: 'Task Priorities' },
];

export function MainNav({ actions }: MainNavProps) {
  const pathname = usePathname() ?? '/';

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg-layer-2/95 shadow-2layer-md backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-stretch gap-4 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6 sm:px-6">
        <Link
          href="/"
          className="flex w-full items-start gap-3 text-left text-foreground transition-colors hover:text-primary-2 sm:w-auto sm:items-center"
        >
          <FileText className="h-7 w-7 text-primary-2" aria-hidden="true" />
          <div className="leading-tight">
            <span className="block text-base font-semibold">Pacenotes</span>
            <span className="block text-xs text-muted-foreground">
              Autonomous document intelligence
            </span>
          </div>
        </Link>

        <nav className="flex w-full flex-wrap items-center gap-2 sm:flex-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'bg-primary-2/10 text-primary-2'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {actions ? (
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-1 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
