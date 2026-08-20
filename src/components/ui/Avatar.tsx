import { useMemo, useState } from "react";
import { cn } from "../../lib/cn";

const AVATAR_PALETTE = [
  "#5b8def",
  "#8c6bd5",
  "#57c75b",
  "#d6a84b",
  "#e35b62",
  "#4d90ea",
  "#74bfe8",
  "#3ba48c",
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

/**
 * Round user avatar with a deterministic initial-based fallback, matching the
 * look of GitHub/Graphite comment authors.
 */
export function Avatar({ src, name, size = 20, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const label = name?.trim() || "user";
  const fallback = useMemo(() => {
    const color = AVATAR_PALETTE[hashString(label) % AVATAR_PALETTE.length];
    return { initials: initialsFrom(label), color };
  }, [label]);

  const dimension = { width: size, height: size };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={label}
        title={label}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={dimension}
      />
    );
  }

  return (
    <span
      aria-hidden
      title={label}
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-[var(--color-text-inverse)]",
        className,
      )}
      style={{ ...dimension, backgroundColor: fallback.color, fontSize: Math.max(9, Math.round(size * 0.45)) }}
    >
      {fallback.initials}
    </span>
  );
}
