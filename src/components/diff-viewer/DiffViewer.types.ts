export interface DiffHunkActionContext {
  filePath: string;
  oldFilePath?: string;
  header: string;
  oldStart?: number;
  newStart?: number;
  patchText: string;
  staged?: boolean;
}

export type DiffHunkActionHandler = (hunk: DiffHunkActionContext) => void | Promise<void>;

export interface DiffViewerProps {
  diffText: string;
  filePath: string;
  oldFilePath?: string;
  focusedFilePath?: string;
  language?: string;
  mode: "unified" | "split";
  isBinary?: boolean;
  isLoading?: boolean;
  error?: string | null;
  isStaged?: boolean;
  isHunkActionPending?: boolean;
  onLineClick?: (line: number) => void;
  onFileSelect?: (path: string) => void;
  onStageHunk?: DiffHunkActionHandler;
  onUnstageHunk?: DiffHunkActionHandler;
  onDiscardHunk?: DiffHunkActionHandler;
}
