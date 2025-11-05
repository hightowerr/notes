'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { CloudSyncButton } from '@/app/components/CloudSyncButton';
import { ConnectionStatus } from '@/app/components/ConnectionStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { SyncEventStatus, SyncEventType } from '@/lib/schemas/syncEventSchema';

type CloudConnection = {
  id: string;
  provider: string;
  provider_display_name: string;
  folder_id: string | null;
  folder_name: string | null;
  sync_enabled: boolean;
  last_sync: string | null;
  created_at: string;
  status?: 'active' | 'error';
  last_error_code?: string | null;
  last_error_message?: string | null;
  last_error_at?: string | null;
};

type SyncSummary = {
  folderName: string | null;
  syncedFiles: number;
  skippedDuplicates: number;
  skippedUnsupported: number;
};

type SyncEvent = {
  id: string;
  connection_id: string;
  event_type: SyncEventType;
  file_name: string | null;
  status: SyncEventStatus;
  error_message: string | null;
  created_at: string;
  external_file_id: string;
  retry_count?: number | null;
  next_retry_at?: string | null;
};

type CloudConnectionsResponse = {
  connections?: CloudConnection[];
  sync_events?: SyncEvent[];
  error?: string;
  message?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  'missing-code': 'Google did not return an authorization code. Please try again.',
  'state-mismatch': 'Could not verify the OAuth response. Start the connection again.',
  'already-connected': 'Disconnect the existing Google Drive account before connecting a new one.',
  'persist-failure': 'Failed to store the connection. Please retry in a moment.',
  'token-exchange': 'Could not exchange the authorization code for tokens. Try again.',
};

export default function CloudSettingsPage() {
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [folderNameInput, setFolderNameInput] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isSyncingFolder, setIsSyncingFolder] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [isDisconnectDialogOpen, setIsDisconnectDialogOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(() => new Set());
  const errorNotificationsRef = useRef(new Map<string, string | null>());

  const fetchConnections = useCallback(async (options?: { silent?: boolean }) => {
    setLoadError(null);

    if (options?.silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await fetch('/api/cloud-connections', {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => null)) as CloudConnectionsResponse | null;

      if (!response.ok) {
        const message = payload?.message ?? payload?.error ?? 'Failed to load cloud connections';
        throw new Error(message);
      }

      setConnections(payload?.connections ?? []);
      setSyncEvents(payload?.sync_events ?? []);
    } catch (error) {
      console.error('[CloudSettings] Failed to load connections', error);
      setLoadError(
        error instanceof Error ? error.message : 'Failed to load cloud connections'
      );
    } finally {
      if (options?.silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  const refreshAfterRedirect = useCallback(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get('connected');
    const error = url.searchParams.get('error');
    let modified = false;

    if (connected === 'google_drive') {
      toast.success('Google Drive connected successfully');
      fetchConnections({ silent: true }).catch(() => {
        /* handled elsewhere */
      });
      url.searchParams.delete('connected');
      modified = true;
    }

    if (error) {
      const friendlyMessage = ERROR_MESSAGES[error] ?? 'Failed to connect Google Drive';
      toast.error(friendlyMessage);
      url.searchParams.delete('error');
      modified = true;
    }

    if (modified) {
      const nextUrl = `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ''}`;
      window.history.replaceState(null, '', nextUrl);
    }
  }, [fetchConnections]);

  useEffect(() => {
    fetchConnections().catch(() => {
      /* error handled in state */
    });
  }, [fetchConnections]);

  useEffect(() => {
    refreshAfterRedirect();
  }, [refreshAfterRedirect]);

  useEffect(() => {
    const notifiedMap = errorNotificationsRef.current;

    connections.forEach((connection) => {
      if (connection.status === 'error') {
        const observedAt = connection.last_error_at ?? 'unknown';
        const previouslyNotified = notifiedMap.get(connection.id);

        if (previouslyNotified !== observedAt) {
          toast.error(connection.last_error_message ?? 'Reconnect Google Drive');
          notifiedMap.set(connection.id, observedAt);
        }
      } else {
        notifiedMap.delete(connection.id);
      }
    });
  }, [connections]);

  const handleDisconnectDialogOpenChange = useCallback(
    (open: boolean) => {
      if (isDisconnecting) {
        return;
      }
      setIsDisconnectDialogOpen(open);
    },
    [isDisconnecting]
  );

  const handleDisconnect = useCallback(async () => {
    if (isDisconnecting) {
      return;
    }

    setIsDisconnecting(true);

    try {
      const response = await fetch('/api/cloud/google-drive/disconnect', {
        method: 'POST',
      });

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

      if (!response.ok) {
        const message =
          (typeof payload?.message === 'string' && payload.message) ||
          (typeof payload?.error === 'string' && payload.error) ||
          'Failed to disconnect Google Drive';
        throw new Error(message);
      }

      const warning =
        payload && typeof (payload as { warning?: unknown }).warning === 'string'
          ? (payload as { warning: string }).warning
          : null;

      if (warning === 'WEBHOOK_STOP_FAILED') {
        toast.warning(
          'Google Drive disconnected, but the Drive webhook could not be stopped. Disable it manually in Google Drive.'
        );
      } else {
        toast.success('Google Drive disconnected');
      }
      setSyncSummary(null);
      setIsDisconnectDialogOpen(false);
      await fetchConnections({ silent: true });
    } catch (error) {
      console.error('[CloudSettings] Failed to disconnect Google Drive', error);
      toast.error(error instanceof Error ? error.message : 'Failed to disconnect Google Drive');
    } finally {
      setIsDisconnecting(false);
    }
  }, [fetchConnections, isDisconnecting]);

  const googleDriveConnection = connections.find(
    (connection) => connection.provider === 'google_drive'
  );

  const isConnected = Boolean(googleDriveConnection);
  const monitoredFolderName = googleDriveConnection?.folder_name ?? null;
  const monitoredFolderId = googleDriveConnection?.folder_id ?? null;
  const manualSyncAvailable = isConnected && Boolean(monitoredFolderId);

  const timestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    []
  );

  const extractFolderId = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return trimmed;
    }

    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) {
      return folderMatch[1];
    }

    const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (queryMatch && queryMatch[1]) {
      return queryMatch[1];
    }

    return null;
  }, []);

  const syncFolder = useCallback(
    async (folderId: string, folderName?: string) => {
      setIsSyncingFolder(true);
      setSyncSummary(null);

      try {
        const response = await fetch('/api/cloud/google-drive/select-folder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            folderId,
            folderName,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

        if (!response.ok) {
          const message =
            (typeof payload.message === 'string' && payload.message) ||
            (typeof payload.error === 'string' && payload.error) ||
            'Failed to sync Google Drive folder';
          throw new Error(message);
        }

        const syncedFiles =
          typeof payload.syncedFiles === 'number' ? payload.syncedFiles : Number(payload.syncedFiles ?? 0);
        const skippedDuplicates = Array.isArray(payload.skippedDuplicates)
          ? payload.skippedDuplicates.length
          : 0;
        const skippedUnsupported = Array.isArray(payload.skippedUnsupported)
          ? payload.skippedUnsupported.length
          : 0;
        const responseFolderName =
          typeof payload.folderName === 'string' && payload.folderName
            ? payload.folderName
            : folderName ?? null;

        setSyncSummary({
          folderName: responseFolderName,
          syncedFiles,
          skippedDuplicates,
          skippedUnsupported,
        });

        const successMessage =
          syncedFiles > 0
            ? `Synced ${syncedFiles} file${syncedFiles === 1 ? '' : 's'} from ${
                responseFolderName ?? 'Google Drive folder'
              }`
            : `Folder selected: ${responseFolderName ?? folderId}`;

        toast.success(successMessage);

        await fetchConnections({ silent: true });
      } catch (error) {
        console.error('[CloudSettings] Failed to sync folder', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to sync Google Drive folder'
        );
      } finally {
        setIsSyncingFolder(false);
      }
    },
    [fetchConnections]
  );

  const handleDialogSubmit = useCallback(() => {
    const folderId = extractFolderId(folderInput);

    if (!folderId) {
      setDialogError('Enter a valid Google Drive folder ID or share link');
      return;
    }

    const folderName = folderNameInput.trim() || undefined;
    setDialogError(null);
    setFolderInput('');
    setFolderNameInput('');
    setIsFolderDialogOpen(false);

    void syncFolder(folderId, folderName);
  }, [extractFolderId, folderInput, folderNameInput, syncFolder]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setIsFolderDialogOpen(open);

    if (!open) {
      setDialogError(null);
      setFolderInput('');
      setFolderNameInput('');
    }
  }, []);

  const openFolderDialog = useCallback(() => {
    setDialogError(null);
    setFolderInput('');
    setFolderNameInput('');
    setIsFolderDialogOpen(true);
  }, []);

  const toggleEventExpansion = useCallback((eventId: string) => {
    setExpandedEvents((current) => {
      const next = new Set(current);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  const isEventExpanded = useCallback(
    (eventId: string) => expandedEvents.has(eventId),
    [expandedEvents]
  );

  const formatEventTimestamp = useCallback(
    (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }

      return timestampFormatter.format(date);
    },
    [timestampFormatter]
  );

  const formatEventType = useCallback((value: SyncEventType) => {
    switch (value) {
      case 'file_added':
        return 'File Added';
      case 'file_modified':
        return 'File Modified';
      case 'file_deleted':
        return 'File Deleted';
      case 'sync_error':
        return 'Sync Error';
      default:
        return value;
    }
  }, []);

  const statusConfig = useMemo<
    Record<
      SyncEventStatus,
      {
        label: string;
        className: string;
      }
    >
  >(
    () => ({
      completed: {
        label: 'Completed',
        className: 'border-emerald-300 bg-emerald-50 text-emerald-700',
      },
      failed: {
        label: 'Failed',
        className: 'border-destructive/40 bg-destructive/10 text-destructive',
      },
      processing: {
        label: 'Processing',
        className: 'border-amber-300 bg-amber-50 text-amber-700',
      },
      pending: {
        label: 'Pending',
        className: 'border-muted-foreground/30 bg-muted/20 text-muted-foreground',
      },
    }),
    []
  );

  const manualSync = useCallback(async () => {
    if (!manualSyncAvailable || isManualSyncing) {
      return;
    }

    setIsManualSyncing(true);
    setSyncSummary(null);

    try {
      const response = await fetch('/api/cloud/google-drive/manual-sync', {
        method: 'POST',
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const message =
          (typeof payload.message === 'string' && payload.message) ||
          (typeof payload.error === 'string' && payload.error) ||
          'Failed to start manual sync';
        throw new Error(message);
      }

      const syncedFiles =
        typeof payload.syncedFiles === 'number' ? payload.syncedFiles : Number(payload.syncedFiles ?? 0);
      const skippedDuplicates = Array.isArray(payload.skippedDuplicates)
        ? payload.skippedDuplicates.length
        : Number(payload.skippedDuplicates ?? 0);
      const skippedUnsupported = Array.isArray(payload.skippedUnsupported)
        ? payload.skippedUnsupported.length
        : Number(payload.skippedUnsupported ?? 0);
      const folderName =
        typeof payload.folderName === 'string' && payload.folderName
          ? payload.folderName
          : monitoredFolderName;

      setSyncSummary({
        folderName: folderName ?? null,
        syncedFiles,
        skippedDuplicates,
        skippedUnsupported,
      });

      if (syncedFiles === 0 && skippedDuplicates === 0 && skippedUnsupported === 0) {
        toast.info('Manual sync completed. No new changes found.');
      } else {
        toast.success(
          `Manual sync finished: ${syncedFiles} new ${syncedFiles === 1 ? 'file' : 'files'}, ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? '' : 's'} skipped.`
        );
      }

      await fetchConnections({ silent: true });
    } catch (error) {
      console.error('[CloudSettings] Manual sync failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to run manual sync');
    } finally {
      setIsManualSyncing(false);
    }
  }, [fetchConnections, isManualSyncing, manualSyncAvailable, monitoredFolderName]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Cloud Sync</h1>
        <p className="text-sm text-muted-foreground">
          Connect your Google Drive account to automatically import notes without manual uploads.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Google Drive</CardTitle>
          <CardDescription>
            Securely connect Google Drive using OAuth 2.0. Tokens are encrypted with AES-256 before
            they reach the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <ConnectionStatus
                providerName="Google Drive"
                isConnected={isConnected}
                connectedAt={googleDriveConnection?.created_at}
                lastSync={googleDriveConnection?.last_sync}
                status={googleDriveConnection?.status}
                errorMessage={googleDriveConnection?.last_error_message}
                lastErrorAt={googleDriveConnection?.last_error_at}
              />

              {loadError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {loadError}
                </div>
              ) : null}

              <CloudSyncButton isConnected={isConnected} isDisabled={isDisconnecting} />

              {isConnected ? (
                <div>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => handleDisconnectDialogOpenChange(true)}
                    disabled={isDisconnecting}
                    className="w-full justify-center sm:w-auto"
                  >
                    {isDisconnecting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Disconnecting...
                      </>
                    ) : (
                      'Disconnect'
                    )}
                  </Button>
                </div>
              ) : null}

              {isConnected ? (
                <>
                  <Separator />
                  <div className="space-y-3 rounded-md border border-muted/40 bg-muted/10 px-3 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Monitored folder</p>
                        {monitoredFolderName ? (
                          <p className="text-sm text-muted-foreground">
                            Monitoring{' '}
                            <span className="font-medium text-foreground">{monitoredFolderName}</span>
                            {monitoredFolderId ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({monitoredFolderId})
                              </span>
                            ) : null}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No folder selected. Choose a folder to start syncing files automatically.
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={openFolderDialog}
                        disabled={isSyncingFolder || isDisconnecting}
                      >
                        {isSyncingFolder ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                            Syncing...
                          </>
                        ) : (
                          'Select Folder'
                        )}
                      </Button>
                    </div>

                    {isSyncingFolder ? (
                      <div className="flex items-center gap-2 rounded-md border border-muted/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Syncing folder... This can take a moment for large folders.
                      </div>
                    ) : null}

                    {syncSummary ? (
                      <div className="space-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        <div className="font-medium">
                          Synced {syncSummary.syncedFiles} file{syncSummary.syncedFiles === 1 ? '' : 's'}
                          {syncSummary.folderName ? ` from ${syncSummary.folderName}` : ''}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                            Duplicates skipped: {syncSummary.skippedDuplicates}
                          </Badge>
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                            Unsupported files: {syncSummary.skippedUnsupported}
                          </Badge>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}

              <Separator />

              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">What happens next?</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>After connecting, select a Drive folder to sync (next step in the workflow).</li>
                  <li>Existing files in the selected folder appear in the dashboard automatically.</li>
                  <li>You can disconnect anytime to remove access tokens immediately.</li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Need help? Review the Google Drive manual test in <code>T002_MANUAL_TEST.md</code>.
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchConnections({ silent: true })}
            disabled={isLoading || isRefreshing}
          >
            {isRefreshing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Refreshing
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                Refresh status
              </>
            )}
          </Button>
      </CardFooter>
    </Card>

      {isConnected ? (
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Sync Activity</CardTitle>
                <CardDescription>
                  Recent Google Drive sync events. Newest entries appear first.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={manualSync}
                disabled={!manualSyncAvailable || isManualSyncing}
              >
                {isManualSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Syncing...
                  </>
                ) : (
                  'Manual Sync'
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : syncEvents.length === 0 ? (
              <div className="rounded-md border border-muted/40 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                No sync activity yet. Upload or modify files in your monitored Google Drive folder to
                see history here.
              </div>
            ) : (
              <ScrollArea className="max-h-96">
                <div className="min-w-[640px]">
                  <div className="hidden grid-cols-[1.5fr_2fr_1.2fr_auto] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                    <div>Timestamp</div>
                    <div>File</div>
                    <div>Event</div>
                    <div className="text-right">Status</div>
                  </div>
                  <div className="divide-y divide-muted/40 border border-muted/40">
                    {syncEvents.map((event) => {
                      const statusStyle = statusConfig[event.status] ?? statusConfig.pending;
                      const hasError = Boolean(event.error_message);
                      const expanded = hasError && isEventExpanded(event.id);

                      return (
                        <div key={event.id} className="bg-background">
                          <div className="flex flex-col gap-3 px-4 py-3 text-sm sm:grid sm:grid-cols-[1.5fr_2fr_1.2fr_auto] sm:items-center sm:gap-4">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">{formatEventTimestamp(event.created_at)}</p>
                              <p className="text-xs text-muted-foreground sm:hidden">
                                {formatEventType(event.event_type)}
                              </p>
                            </div>
                            <div className="space-y-1 sm:space-y-0">
                              <p className="font-medium text-foreground">{event.file_name ?? 'Untitled file'}</p>
                              <p className="text-xs text-muted-foreground sm:hidden">
                                Status: {statusStyle.label}
                              </p>
                            </div>
                            <div className="hidden sm:block">
                              <Badge variant="outline" className="border-muted-foreground/30">
                                {formatEventType(event.event_type)}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between gap-3 sm:justify-end">
                              <Badge
                                variant="outline"
                                className={cn('border px-2 py-1 text-xs font-medium', statusStyle.className)}
                              >
                                {statusStyle.label}
                              </Badge>
                              {hasError ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleEventExpansion(event.id)}
                                >
                                  {expanded ? (
                                    <>
                                      <ChevronDown className="h-4 w-4" aria-hidden />
                                      Hide error
                                    </>
                                  ) : (
                                    <>
                                      <ChevronRight className="h-4 w-4" aria-hidden />
                                      View error
                                    </>
                                  )}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </div>
                          {expanded ? (
                            <div className="border-t border-destructive-bg bg-destructive-bg px-4 py-3 text-sm text-destructive-text">
                              {event.error_message}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={isFolderDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Google Drive folder</DialogTitle>
            <DialogDescription>
              Paste a Google Drive folder URL or ID. The initial sync will begin as soon as you
              confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="folder-url">Folder link or ID</Label>
              <Input
                id="folder-url"
                autoFocus
                placeholder="https://drive.google.com/drive/folders/..."
                value={folderInput}
                onChange={(event) => setFolderInput(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-name">Display name (optional)</Label>
              <Input
                id="folder-name"
                placeholder="Team Project Notes"
                value={folderNameInput}
                onChange={(event) => setFolderNameInput(event.target.value)}
              />
            </div>
            {dialogError ? (
              <p className="text-sm text-destructive">{dialogError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Tip: Open the folder in drive.google.com and copy the URL. You can also paste the raw
                folder ID.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={isSyncingFolder}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleDialogSubmit} disabled={isSyncingFolder}>
              {isSyncingFolder ? 'Syncing...' : 'Start Sync'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDisconnectDialogOpen} onOpenChange={handleDisconnectDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect Google Drive?</DialogTitle>
            <DialogDescription>
              This stops all future sync activity immediately. Existing notes stay in your workspace.
              To delete synced files, use the dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDisconnectDialogOpenChange(false)}
              disabled={isDisconnecting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
