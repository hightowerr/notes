export type RetryStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type RetryStatusEntry = {
  status: RetryStatus;
  attempts: number;
  last_error?: string | null;
  updated_at?: string;
  max_attempts?: number;
};
