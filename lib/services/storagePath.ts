type BuildStoragePathParams = {
  provider: 'google_drive' | string;
  connectionId?: string | null;
  contentHash: string;
  filename: string;
};

export function buildCloudStoragePath({
  provider,
  connectionId,
  contentHash,
  filename,
}: BuildStoragePathParams): string {
  const slug = provider === 'google_drive' ? 'cloud/google-drive' : `cloud/${provider}`;
  const parts = [slug];

  if (connectionId) {
    parts.push(connectionId);
  }

  const hashPrefix = contentHash.slice(0, 8);
  const safeName = filename.trim() || `${slug.replace('/', '-')}-${hashPrefix}`;

  parts.push(`${hashPrefix}-${safeName}`);

  return parts.join('/');
}
