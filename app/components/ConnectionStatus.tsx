'use client';

import { Badge } from '@/components/ui/badge';

interface ConnectionStatusProps {
  providerName: string;
  isConnected: boolean;
  connectedAt?: string | null;
  lastSync?: string | null;
  status?: 'active' | 'error';
  errorMessage?: string | null;
  lastErrorAt?: string | null;
}

function formatTimestamp(timestamp?: string | null) {
  if (!timestamp) return null;

  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    console.error('[ConnectionStatus] Failed to format timestamp', error);
    return null;
  }
}

export function ConnectionStatus({
  providerName,
  isConnected,
  connectedAt,
  lastSync,
  status,
  errorMessage,
  lastErrorAt,
}: ConnectionStatusProps) {
  const statusLabel = isConnected ? 'Connected' : 'Disconnected';
  const statusClasses = isConnected
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
    : 'border-muted bg-muted text-muted-foreground';

  const connectedAtLabel = formatTimestamp(connectedAt);
  const lastSyncLabel = formatTimestamp(lastSync);
  const lastErrorLabel = formatTimestamp(lastErrorAt);
  const isError = status === 'error';

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium">{providerName}</div>
        <Badge variant="outline" className={statusClasses}>
          {statusLabel}
        </Badge>
        {isError ? (
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
            Action required
          </Badge>
        ) : null}
      </div>
      {isConnected ? (
        <p className="text-sm text-muted-foreground">
          {connectedAtLabel ? `Connected on ${connectedAtLabel}` : 'Connection active'}
          {lastSyncLabel ? ` • Last sync ${lastSyncLabel}` : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect your {providerName} account to enable automatic sync.
        </p>
      )}
      {isError ? (
        <p className="text-sm text-destructive">
          {errorMessage ?? 'Reconnect Google Drive'}
          {lastErrorLabel ? ` • Noticed ${lastErrorLabel}` : null}
        </p>
      ) : null}
    </div>
  );
}
