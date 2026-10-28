export type FolderEntryKind = "file" | "dir" | "other";

export interface FolderEntry {
  name: string;
  /** Kind after following symlinks; `other` covers devices, sockets and broken links. */
  kind: FolderEntryKind;
  symlink: boolean;
  /** Bytes, files only. */
  size: number | null;
  /** Modification time, Unix seconds. */
  modified: number | null;
  mime: string | null;
}

export interface FolderListing {
  /** Absolute folder path. */
  path: string;
  /** Absolute parent folder, `null` at the root. */
  parent: string | null;
  entries: FolderEntry[];
  /** The host returned only part of the folder. */
  truncated: boolean;
}

export type FolderLoader = (path: string) => Promise<FolderListing>;

export interface PathSegment { label: string; path: string }

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export type FolderSortKey = "name" | "size" | "modified";
export interface FolderSort { key: FolderSortKey; descending: boolean }
export const DEFAULT_SORT: Readonly<FolderSort> = Object.freeze({ key: "name", descending: false });

/** Where a feed delivers each listing of the folder, or why it cannot. */
export interface FolderFeedSink {
  listing(listing: FolderListing): void;
  error(message: string): void;
}
/**
 * A host-owned live source of listings for one folder: calls
 * `sink.listing` with the current listing, then again on every change
 * (or `sink.error`), until the returned function is called.  The browser
 * fetches nothing itself when it has a feed.
 */
export type FolderFeed = (path: string, sink: FolderFeedSink) => () => void;

/** Pixel widths of the resizable columns; Name takes the remaining space. */
export interface FolderColumnWidths { size: number; modified: number }
export const DEFAULT_COLUMN_WIDTHS: Readonly<FolderColumnWidths> = Object.freeze({ size: 88, modified: 112 });
export const MIN_COLUMN_WIDTHS: Readonly<FolderColumnWidths> = Object.freeze({ size: 56, modified: 72 });
export const MAX_COLUMN_WIDTH = 480;

export function clampColumnWidth(column: keyof FolderColumnWidths, width: number): number {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTHS[column], width)));
}

const byName = (a: FolderEntry, b: FolderEntry) =>
  collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Missing values sort after present ones, whatever the direction. */
function byNumber(a: number | null, b: number | null, descending: boolean): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return descending ? b - a : a - b;
}

/**
 * Folders first (as GNOME Files does), then by the sort key; names use a
 * natural case-insensitive order, ties fall back to the name.
 */
export function sortEntries(entries: FolderEntry[], sort: FolderSort = DEFAULT_SORT): FolderEntry[] {
  return entries.slice().sort((a, b) => {
    const dirs = Number(b.kind === "dir") - Number(a.kind === "dir");
    if (dirs) return dirs;
    if (sort.key === "name") return sort.descending ? byName(b, a) : byName(a, b);
    const key = sort.key;
    return byNumber(a[key], b[key], sort.descending) || byName(a, b);
  });
}

const SIZE_UNITS = ["kB", "MB", "GB", "TB", "PB"];

/** GNOME Files style sizes: decimal (SI) units, one decimal. */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return bytes === 1 ? "1 byte" : `${bytes} bytes`;
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 999.95 && unit < SIZE_UNITS.length - 1) { value /= 1000; unit += 1; }
  return `${value.toFixed(1)} ${SIZE_UNITS[unit]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** GNOME Files style dates: "Today 14:32", "Yesterday 09:05", otherwise "12 Oct 2026". */
export function formatModified(seconds: number, now: Date = new Date()): string {
  const d = new Date(seconds * 1000);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay(d, now)) return `Today ${time}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Yesterday ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? dir + name : `${dir}/${name}`;
}

const trimSlash = (p: string) => p.length > 1 ? p.replace(/\/+$/, "") : p;

/** Clickable path-bar segments; a path at or under `home` starts with a `~` segment. */
export function pathSegments(path: string, home?: string | null): PathSegment[] {
  const target = trimSlash(path);
  const base = home ? trimSlash(home) : null;
  let segments: PathSegment[];
  let rest: string;
  if (base && base !== "/" && (target === base || target.startsWith(base + "/"))) {
    segments = [{ label: "~", path: base }];
    rest = target.slice(base.length);
  } else {
    segments = [{ label: "/", path: "/" }];
    rest = target;
  }
  let current = segments[0]!.path;
  for (const part of rest.split("/").filter(Boolean)) {
    current = joinPath(current, part);
    segments.push({ label: part, path: current });
  }
  return segments;
}
