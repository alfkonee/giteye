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
  onLineClick?: (line: number) => void;
  onFileSelect?: (path: string) => void;
}
