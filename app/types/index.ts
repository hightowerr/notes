export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: number;
}

export interface Topic {
  id: string;
  text: string;
}

export interface Decision {
  id: string;
  text: string;
  context?: string;
}

export interface Action {
  id: string;
  text: string;
}

export type TaskCategory = 'leverage' | 'neutral' | 'overhead';

export interface Task {
  id: string;
  text: string;
  category: TaskCategory;
}

export interface NotesData {
  files: UploadedFile[];
  topics: Topic[];
  decisions: Decision[];
  actions: Action[];
  tasks: {
    leverage: Task[];
    neutral: Task[];
    overhead: Task[];
  };
}
