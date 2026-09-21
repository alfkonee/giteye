import { useEffect, useRef } from "react";
import {
  Annotation,
  Compartment,
  EditorState,
  Text,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightSpecialChars,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  search,
  searchKeymap,
  highlightSelectionMatches,
} from "@codemirror/search";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  bracketMatching,
} from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { rust } from "@codemirror/lang-rust";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { useConflictStore } from "../../stores/conflict-store";
import {
  conflictRegions,
  resultLineSeparator,
  type RegionChoice,
} from "./conflict-text";

const callbacks = new Compartment();
const editability = new Compartment();
const bufferRefresh = Annotation.define<boolean>();
const lineEnding = new Compartment();
const conflictHighlights = new Compartment();

class ConflictActionsWidget extends WidgetType {
  constructor(
    readonly index: number,
    readonly disabled: boolean,
    readonly resolve: {
      current: (index: number, choice: RegionChoice) => void;
    },
  ) {
    super();
  }

  eq(other: ConflictActionsWidget) {
    return (
      this.index === other.index &&
      this.disabled === other.disabled &&
      this.resolve === other.resolve
    );
  }

  toDOM() {
    const group = document.createElement("div");
    group.className = "cm-conflict-actions";
    group.contentEditable = "false";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", `Resolve conflict ${this.index + 1}`);
    const choices: [RegionChoice, string][] = [
      ["current", "Accept current"],
      ["incoming", "Accept incoming"],
      ["currentIncoming", "Current then incoming"],
      ["incomingCurrent", "Incoming then current"],
    ];
    for (const [choice, label] of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = this.disabled;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.resolve.current(this.index, choice);
      });
      group.append(button);
    }
    return group;
  }
}

function languageFor(path: string): Extension {
  if (/\.[cm]?[jt]sx?$/.test(path))
    return javascript({
      typescript: /\.[cm]?tsx?$/.test(path),
      jsx: /\.[jt]sx$/.test(path),
    });
  if (/\.jsonc?$/.test(path)) return json();
  if (/\.rs$/.test(path)) return rust();
  if (/\.py$/.test(path)) return python();
  if (/\.mdx?$/.test(path)) return markdown();
  return [];
}

export function ConflictEditor({
  repoPath,
  filePath,
  disabled,
  activeRegion,
  navigationRequest,
  onSave,
  onResolveRegion,
}: {
  repoPath: string;
  filePath: string;
  disabled: boolean;
  activeRegion: number;
  navigationRequest: number;
  onSave: () => void;
  onResolveRegion: (index: number, choice: RegionChoice) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const resolveRef = useRef(onResolveRegion);
  resolveRef.current = onResolveRegion;
  const draft = useConflictStore(
    (state) => state.sessions[repoPath]?.files[filePath],
  );
  const text =
    draft?.resolution?.kind === "text" ? draft.resolution.content : "";

  useEffect(() => {
    const file =
      useConflictStore.getState().sessions[repoPath]?.files[filePath];
    if (!host.current || !file) return;
    let syncing = false;
    const updateListener = EditorView.updateListener.of((update) => {
      if (syncing) return;
      useConflictStore.getState().updateFile(repoPath, filePath, (current) =>
        current.initial !== file.initial
          ? current
          : {
              ...current,
              editorState: update.state,
              ...(update.docChanged &&
              !update.transactions.some((transaction) =>
                transaction.annotation(bufferRefresh),
              )
                ? {
                    resolution: {
                      kind: "text" as const,
                      content: update.state.sliceDoc(),
                    },
                    dirty:
                      !current.content.resultExists ||
                      update.state.sliceDoc() !== current.content.result,
                    version: current.version + 1,
                    ai:
                      current.ai.status === "ready" ||
                      current.ai.status === "running"
                        ? { ...current.ai, status: "stale" as const }
                        : current.ai,
                  }
                : {}),
            },
      );
    });
    const editor = new EditorView({
      parent: host.current,
      state:
        file.editorState ??
        EditorState.create({
          doc: file.resolution?.kind === "text" ? file.resolution.content : "",
          extensions: [
            lineNumbers(),
            highlightSpecialChars(),
            drawSelection(),
            history(),
            highlightActiveLine(),
            bracketMatching(),
            search({ top: true }),
            highlightSelectionMatches(),
            syntaxHighlighting(defaultHighlightStyle),
            languageFor(filePath),
            callbacks.of([]),
            editability.of([]),
            conflictHighlights.of([]),
            lineEnding.of(
              EditorState.lineSeparator.of(
                resultLineSeparator(
                  file.resolution?.kind === "text"
                    ? file.resolution.content
                    : "",
                ),
              ),
            ),
            EditorView.contentAttributes.of({
              "aria-label": `Editable result for ${filePath}`,
              "aria-multiline": "true",
            }),
            keymap.of([
              ...defaultKeymap,
              ...historyKeymap,
              ...searchKeymap,
              indentWithTab,
            ]),
            EditorView.theme({
              "&": {
                height: "100%",
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
                fontSize: "12px",
              },
              ".cm-scroller": {
                overflow: "auto",
                fontFamily: "var(--font-mono, monospace)",
                minHeight: "240px",
              },
              ".cm-gutters": {
                backgroundColor: "var(--color-bg-secondary)",
                color: "var(--color-text-muted)",
                borderRight: "1px solid var(--color-border)",
              },
              ".cm-activeLine, .cm-activeLineGutter": {
                backgroundColor: "var(--color-bg-selected-muted)",
              },
              ".cm-cursor": { borderLeftColor: "var(--color-text-primary)" },
              ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
                backgroundColor: "var(--color-bg-selected)",
              },
              ".cm-panels": {
                backgroundColor: "var(--color-bg-secondary)",
                color: "var(--color-text-primary)",
              },
              ".cm-conflict-region": {
                backgroundColor:
                  "color-mix(in srgb, var(--color-warning) 9%, transparent)",
                borderLeft:
                  "3px solid color-mix(in srgb, var(--color-warning) 40%, transparent)",
              },
              ".cm-conflict-active": {
                backgroundColor:
                  "color-mix(in srgb, var(--color-accent) 18%, transparent)",
                borderLeft: "3px solid var(--color-accent)",
              },
              ".cm-conflict-actions": {
                display: "flex",
                flexWrap: "wrap",
                gap: "4px 16px",
                padding: "7px 8px",
                backgroundColor: "var(--color-bg-secondary)",
                borderTop: "1px solid var(--color-border)",
                fontFamily: "var(--font-sans, sans-serif)",
                fontSize: "11px",
              },
              ".cm-conflict-actions button": {
                color: "var(--color-accent)",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              },
              ".cm-conflict-actions button:hover": {
                color: "var(--color-text-primary)",
              },
              ".cm-conflict-actions button:focus-visible": {
                outline: "2px solid var(--color-accent)",
                outlineOffset: "3px",
              },
              ".cm-conflict-actions button:disabled": {
                opacity: "0.45",
                cursor: "default",
              },
            }),
          ],
        }),
    });
    syncing = true;
    editor.dispatch({
      effects: [
        callbacks.reconfigure([
          updateListener,
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                saveRef.current();
                return true;
              },
            },
          ]),
        ]),
        editability.reconfigure(EditorState.readOnly.of(disabled)),
      ],
    });
    syncing = false;
    editor.scrollDOM.scrollTop = file.scrollTop;
    view.current = editor;
    return () => {
      useConflictStore.getState().updateFile(repoPath, filePath, (current) =>
        current.initial !== file.initial
          ? current
          : {
              ...current,
              editorState: editor.state,
              scrollTop: editor.scrollDOM.scrollTop,
            },
      );
      editor.destroy();
      view.current = null;
    };
    // File identity owns the editor lifetime; live props are applied as transactions below.
  }, [repoPath, filePath]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.sliceDoc() === text) return;
    const separator = resultLineSeparator(text);
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: Text.of(text.split(separator)),
      },
      effects: lineEnding.reconfigure(EditorState.lineSeparator.of(separator)),
      annotations: bufferRefresh.of(true),
    });
  }, [text]);
  useEffect(() => {
    view.current?.dispatch({
      effects: editability.reconfigure(EditorState.readOnly.of(disabled)),
    });
  }, [disabled]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const regions = conflictRegions(editor.state.doc.toString());
    const highlights: Range<Decoration>[] = [];
    regions.forEach((region, index) => {
      const first = editor.state.doc.lineAt(region.start).number;
      const last = editor.state.doc.lineAt(
        Math.max(region.start, region.end - 1),
      ).number;
      highlights.push(
        Decoration.widget({
          widget: new ConflictActionsWidget(index, disabled, resolveRef),
          block: true,
          side: -1,
        }).range(editor.state.doc.line(first).from),
      );
      for (let number = first; number <= last; number++) {
        highlights.push(
          Decoration.line({
            class:
              index === activeRegion
                ? "cm-conflict-region cm-conflict-active"
                : "cm-conflict-region",
            attributes: { "data-conflict-region": String(index + 1) },
          }).range(editor.state.doc.line(number).from),
        );
      }
    });
    editor.dispatch({
      effects: conflictHighlights.reconfigure(
        EditorView.decorations.of(Decoration.set(highlights, true)),
      ),
    });
  }, [text, activeRegion, disabled]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || navigationRequest === 0) return;
    const region = conflictRegions(editor.state.doc.toString())[activeRegion];
    if (!region) return;
    editor.dispatch({
      selection: { anchor: region.start },
      effects: EditorView.scrollIntoView(region.start, { y: "center" }),
    });
    editor.focus();
  }, [navigationRequest]);

  return (
    <div
      ref={host}
      className="min-h-[260px] overflow-hidden border-y border-[var(--color-border)]"
    />
  );
}
