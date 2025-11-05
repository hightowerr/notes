export function isLegacySchemaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message =
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.toLowerCase()
      : '';

  if (!message) {
    return false;
  }

  return (
    message.includes('folder_name') ||
    message.includes('status') ||
    message.includes('last_error') ||
    message.includes('retry_count') ||
    message.includes('next_retry')
  );
}
