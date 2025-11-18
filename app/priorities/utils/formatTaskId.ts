export function formatTaskId(taskId: string): string {
  if (!taskId) {
    return 'Unknown task';
  }

  const sanitized = taskId.replace(/-/g, '');
  const isRawUuid = /^[0-9a-f]+$/i.test(sanitized) && sanitized.length >= 32;
  if (isRawUuid) {
    return 'Untitled task';
  }

  const parts = taskId.split('::');
  const last = parts[parts.length - 1];
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

