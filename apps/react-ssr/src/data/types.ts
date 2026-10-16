export interface Task {
  id: string;
  title: string;
}

export interface Store {
  count: number;
  reads: number;
  tasks: Task[];
}

export interface Mutation {
  changed: boolean;
  message: string;
}
