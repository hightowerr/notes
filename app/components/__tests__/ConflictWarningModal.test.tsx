import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { ConflictWarningModal } from '../ConflictWarningModal';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...rest }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" {...rest}>
      {children}
    </button>
  ),
}));

describe('ConflictWarningModal', () => {
  it('renders similarity and existing task text', () => {
    render(
      <ConflictWarningModal
        open
        onClose={() => {}}
        existingTaskText="Existing task example"
        similarity={0.92}
        onEditDescription={() => {}}
        onForceCreate={() => {}}
      />
    );

    expect(screen.getByText(/Similar task found/i)).toBeInTheDocument();
    expect(screen.getByText('Existing task example')).toBeInTheDocument();
    expect(screen.getByText(/92% similar/i)).toBeInTheDocument();
  });

  it('fires callbacks for actions', () => {
    const onClose = vi.fn();
    const onEdit = vi.fn();
    const onForce = vi.fn();

    render(
      <ConflictWarningModal
        open
        onClose={onClose}
        existingTaskText="Existing task example"
        similarity={0.9}
        onEditDescription={onEdit}
        onForceCreate={onForce}
      />
    );

    fireEvent.click(screen.getByText(/Edit description/i));
    fireEvent.click(screen.getByText(/Create anyway/i));
    fireEvent.click(screen.getByText(/Cancel/i));

    expect(onEdit).toHaveBeenCalled();
    expect(onForce).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
