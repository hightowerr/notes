'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface CloudSyncButtonProps {
  isConnected: boolean;
  isDisabled?: boolean;
}

function GoogleDriveLogo() {
  return (
    <svg
      className="mr-2 h-4 w-4"
      viewBox="0 0 48 48"
      role="img"
      aria-hidden="true"
    >
      <path fill="#0F9D58" d="M20.79 7.04h7.52l12.9 21.96-3.76 6.5z" />
      <path fill="#4285F4" d="M12.55 40.96h21.54l3.86-6.54H16.41z" />
      <path fill="#F4B400" d="M7.79 29l8.62-14.9 3.91 6.6-8.7 14.9z" />
    </svg>
  );
}

export function CloudSyncButton({ isConnected, isDisabled = false }: CloudSyncButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    if (isConnected || isLoading || isDisabled) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/cloud/google-drive/connect', {
        method: 'POST',
      });

      if (response.status === 409) {
        const payload = await response.json().catch(() => null);
        toast.error(payload?.message ?? 'Disconnect existing account first');
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.message ??
          payload?.error ??
          'Failed to start Google Drive connection';
        toast.error(message);
        return;
      }

      const payload = (await response.json()) as { authUrl?: string };

      if (!payload?.authUrl) {
        toast.error('Missing Google authorization URL');
        return;
      }

      window.location.href = payload.authUrl;
    } catch (error) {
      console.error('[CloudSyncButton] Failed to initiate OAuth', error);
      toast.error('Could not start Google Drive connection. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        disabled={isConnected || isLoading || isDisabled}
        onClick={handleConnect}
        className="w-full justify-center"
      >
        <GoogleDriveLogo />
        {isConnected ? 'Google Drive Connected' : isLoading ? 'Connecting...' : 'Connect Google Drive'}
      </Button>
    </div>
  );
}
