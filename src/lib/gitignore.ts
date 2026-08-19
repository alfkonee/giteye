export interface IgnoreSuggestion {
  id: string;
  label: string;
  description: string;
  pattern: string;
}

/**
 * Escapes the glob metacharacters Git treats specially inside a gitignore path
 * segment, so a literal path is matched literally.
 */
function escapeSegment(segment: string): string {
  return segment.replace(/([\\*?[\]])/g, "\\$1");
}

/**
 * Escapes leading `#`/`!` (comment and negation markers) and trailing spaces,
 * which Git strips unless they are backslash escaped.
 */
function escapeLine(pattern: string): string {
  const escapedStart =
    pattern.startsWith("#") || pattern.startsWith("!") ? `\\${pattern}` : pattern;
  return escapedStart.replace(/ +$/, (spaces) => spaces.replace(/ /g, "\\ "));
}

function segmentsOf(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

/**
 * Builds a gitignore pattern for a repo-relative path.
 *
 * `anchored` patterns start with `/` so they only match that exact path from the
 * repository root; unanchored patterns match the same name at any depth.
 */
export function toIgnorePattern(
  path: string,
  options: { anchored: boolean; directory: boolean },
): string {
  const segments = segmentsOf(path).map(escapeSegment);
  if (segments.length === 0) return "";

  const body = segments.join("/");
  const suffix = options.directory ? "/" : "";
  return escapeLine(options.anchored ? `/${body}${suffix}` : `${body}${suffix}`);
}

function extensionOf(fileName: string): string | null {
  // Leading dot means a dotfile (".env"), not an extension.
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1);
}

/**
 * Ignore patterns offered for a working tree path, most specific first.
 */
export function buildIgnoreSuggestions(
  path: string,
  kind: "file" | "directory",
): IgnoreSuggestion[] {
  const segments = segmentsOf(path);
  if (segments.length === 0) return [];

  const name = segments[segments.length - 1];
  const parent = segments.slice(0, -1).join("/");
  const isDirectory = kind === "directory";
  const suggestions: IgnoreSuggestion[] = [
    {
      id: "exact",
      label: isDirectory ? "This folder" : "This file",
      description: `Ignores only ${path}`,
      pattern: toIgnorePattern(path, { anchored: true, directory: isDirectory }),
    },
  ];

  if (!isDirectory) {
    const extension = extensionOf(name);
    if (extension) {
      suggestions.push({
        id: "extension",
        label: `All .${extension} files`,
        description: `Ignores every .${extension} file in the repository`,
        pattern: escapeLine(`*.${escapeSegment(extension)}`),
      });
    }
  }

  suggestions.push({
    id: "name",
    label: isDirectory ? `Any folder named ${name}` : `Any file named ${name}`,
    description: `Ignores ${name} at any depth in the repository`,
    pattern: toIgnorePattern(name, { anchored: false, directory: isDirectory }),
  });

  if (parent) {
    suggestions.push({
      id: "parent",
      label: `The containing folder ${parent}/`,
      description: `Ignores everything under ${parent}/`,
      pattern: toIgnorePattern(parent, { anchored: true, directory: true }),
    });
  }

  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    if (!suggestion.pattern || seen.has(suggestion.pattern)) return false;
    seen.add(suggestion.pattern);
    return true;
  });
}
