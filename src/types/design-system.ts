import type { ReactNode } from "react";

export type ComponentTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "purple";
export type ComponentSize = "compact" | "default" | "comfortable";
export type ComponentState = "rest" | "hover" | "active" | "selected" | "disabled" | "loading" | "danger";

export interface ToolbarButtonContract {
  id: string;
  label: string;
  icon?: ReactNode;
  title?: string;
  variant: "ghost" | "secondary" | "primary" | "danger";
  size: ComponentSize;
  state?: ComponentState;
  disabled?: boolean;
  onSelect?: () => void;
}

export interface SplitButtonContract extends ToolbarButtonContract {
  menuLabel: string;
  items: Array<{
    id: string;
    label: string;
    description?: string;
    tone?: ComponentTone;
    disabled?: boolean;
    destructive?: boolean;
    onSelect?: () => void;
  }>;
}

export interface CardContract {
  id: string;
  title: string;
  eyebrow?: string;
  description?: string;
  icon?: ReactNode;
  tone?: ComponentTone;
  metric?: string | number;
  detail?: ReactNode;
  action?: ToolbarButtonContract;
  selected?: boolean;
}

export interface BadgeContract {
  label: string;
  tone: ComponentTone;
  variant?: "solid" | "soft" | "outline";
  icon?: ReactNode;
}

export interface TableColumnContract<Row> {
  id: string;
  label: string;
  width?: number | string;
  align?: "start" | "center" | "end";
  render: (row: Row) => ReactNode;
}

export interface TableContract<Row> {
  id: string;
  rows: Row[];
  columns: Array<TableColumnContract<Row>>;
  density?: ComponentSize;
  selectedId?: string;
  getRowId: (row: Row) => string;
  onSelect?: (row: Row) => void;
}

export interface GraphLaneContract {
  id: string;
  color: "blue" | "purple" | "green" | "amber" | "red" | "gray";
  label?: string;
  selected?: boolean;
}

export interface TimelineItemContract {
  id: string;
  title: string;
  description?: string;
  actor?: string;
  timestamp?: string;
  tone?: ComponentTone;
  icon?: ReactNode;
}

export interface DiffPanelContract {
  id: string;
  title: string;
  filePath: string;
  oldFilePath?: string;
  mode: "unified" | "split" | "three-way";
  status?: "added" | "modified" | "deleted" | "renamed" | "conflict";
  comments?: number;
  virtualized?: boolean;
}
