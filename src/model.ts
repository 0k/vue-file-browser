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
export const DEFAULT_COLUMN_WIDTHS: Readonly<FolderColumnWidths> = Object.freeze({ size: 96, modified: 136 });
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

/** A size split for column alignment: `305` `` `bytes`, `1` `.4` `kB`. */
export interface SizeParts { whole: string; fraction: string; unit: string }

/** GNOME Files style sizes: decimal (SI) units, one decimal above 1000 bytes. */
export function sizeParts(bytes: number): SizeParts {
  if (bytes < 1000) return { whole: String(bytes), fraction: "", unit: bytes === 1 ? "byte" : "bytes" };
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 999.95 && unit < SIZE_UNITS.length - 1) { value /= 1000; unit += 1; }
  const [whole, decimals] = value.toFixed(1).split(".");
  return { whole: whole!, fraction: `.${decimals}`, unit: SIZE_UNITS[unit]! };
}

export function formatSize(bytes: number): string {
  const p = sizeParts(bytes);
  return `${p.whole}${p.fraction} ${p.unit}`;
}

/** The month abbreviations dates use, exported so hosts can size the month slot. */
export const MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A date split for column alignment.  The two forms never align with each
 * other; within a form every part has a fixed slot.
 */
export type ModifiedParts =
  | { form: "relative"; word: "Today" | "Yesterday"; time: string }
  | { form: "date"; day: string; month: string; year: string };

/** GNOME Files style dates: "Today 14:32", "Yesterday 09:05", otherwise "12 Oct 2026". */
export function modifiedParts(seconds: number, now: Date = new Date()): ModifiedParts {
  const d = new Date(seconds * 1000);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay(d, now)) return { form: "relative", word: "Today", time };
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return { form: "relative", word: "Yesterday", time };
  return { form: "date", day: String(d.getDate()), month: MONTHS[d.getMonth()]!, year: String(d.getFullYear()) };
}

export function formatModified(seconds: number, now: Date = new Date()): string {
  const p = modifiedParts(seconds, now);
  return p.form === "relative" ? `${p.word} ${p.time}` : `${p.day} ${p.month} ${p.year}`;
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
