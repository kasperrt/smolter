export interface Attributes {
  [key: string]: unknown;
}

export type ElementFactory<N> = (
  tag: string,
  props: Attributes | null,
  ...children: (N | string | number)[]
) => N;

export type LinkFactory<N> = (
  href: string,
  children: N | string,
  className?: string,
) => N;

export interface CounterProps<N> {
  data?: { count: number; reads: number };
  state: string;
  message?: string;
  form: (children: N[]) => N;
  revalidate?: () => void;
}

export interface ShellProps<N> {
  mode: "React" | "Preact" | "SSR" | "React SSR" | "Preact SSR";
  basePort?: number;
  routePath?: string;
  hosted?: boolean;
  source?: N;
  content: N;
  link?: LinkFactory<N>;
}

export interface CodePanelProps {
  files: Record<string, string>;
  active: string;
  select: (file: string) => void;
}

export interface ArticleProps {
  title: string;
  paragraphs: string[];
}

export interface TaskData {
  id: string;
  title: string;
}

export interface TaskProps<N> {
  state: string;
  message?: string;
  form: (children: N[]) => N;
}

export interface TaskListProps<N> extends TaskProps<N> {
  tasks: TaskData[];
  preview?: N;
  link: LinkFactory<N>;
}

export interface TaskPreviewProps {
  task?: TaskData;
  state: string;
  load: () => void;
}

export interface TaskSearchProps<N> {
  query: string;
  tasks: TaskData[];
  form: (children: N[]) => N;
  link: LinkFactory<N>;
}

export interface TaskDetailProps<N> extends TaskProps<N> {
  link: LinkFactory<N>;
  task?: TaskData;
}
