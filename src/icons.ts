import type { FolderEntry } from "./model";

/** 16×16 SVG path data, drawn in the style of the Adwaita symbolic icons. */
export const ICONS = {
  up: "M8 2.6 2.3 8.3l1.4 1.4L7 6.4V14h2V6.4l3.3 3.3 1.4-1.4z",
  hidden: "M8 3C4.5 3 1.7 5.2 1 8c.7 2.8 3.5 5 7 5s6.3-2.2 7-5c-.7-2.8-3.5-5-7-5zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4zM8 6.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z",
  home: "M8 1.5 1 7.5h2V14h3.5v-4h3v4H13V7.5h2z",
  folder: "M1 3.5A1.5 1.5 0 0 1 2.5 2h3.6l1.6 1.6h5.8A1.5 1.5 0 0 1 15 5.1v7.4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5z",
  file: "M3.5 1h6L13 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 2 13.5v-11A1.5 1.5 0 0 1 3.5 1zM9 1.8V5h3.2z",
  text: "M3.5 1h6L13 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 2 13.5v-11A1.5 1.5 0 0 1 3.5 1zM4 7v1h7V7zm0 2v1h7V9zm0 2v1h5v-1z",
  image: "M2.5 2h11A1.5 1.5 0 0 1 15 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9A1.5 1.5 0 0 1 2.5 2zM3 12h10L9.5 7 7 10.3 5.5 8.5zm2-6.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z",
  audio: "M6 2.5 14 1v9.5a2.2 2.2 0 1 1-1.5-2.08V4.1L7.5 5v7.5a2.2 2.2 0 1 1-1.5-2.08z",
  video: "M2.5 3h7A1.5 1.5 0 0 1 11 4.5v1.8L15 4v8l-4-2.3v1.8A1.5 1.5 0 0 1 9.5 13h-7A1.5 1.5 0 0 1 1 11.5v-7A1.5 1.5 0 0 1 2.5 3z",
  pdf: "M3.5 1h6L13 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 2 13.5v-11A1.5 1.5 0 0 1 3.5 1zM4 9v3h1.2v-1h.6a1 1 0 0 0 0-2zm3 0v3h1.2a1.5 1.5 0 0 0 0-3zm3 0v3h1.2v-1h1v-.8h-1V9.8H12V9z",
  archive: "M3.5 1h9A1.5 1.5 0 0 1 14 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-11A1.5 1.5 0 0 1 3.5 1zM7 2v1.5h2V2zm0 3v1.5h2V5zm0 3v1.5h2V8zm-.5 3v2.5h3V11z",
  unknown: "M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.9 11H7.1v-1.7h1.8zm1.8-5.6c-.3.6-.8 1-1.3 1.3-.4.3-.5.5-.5 1v.4H7.1v-.5c0-.9.3-1.4 1-1.9.5-.4.8-.6.8-1.1 0-.5-.4-.8-.9-.8-.6 0-1 .4-1 1H5.2c0-1.6 1.2-2.7 2.9-2.7 1.6 0 2.8.9 2.8 2.3 0 .4-.1.7-.2 1z",
  link: "M9 1v2.5C4.5 3.9 2 6.7 2 11c1.3-2.3 3.6-3.4 7-3.5V10l5-4.5z",
} as const;

export type IconName = keyof typeof ICONS;

const ARCHIVE = /^application\/(zip|gzip|x-(tar|gzip|bzip2|xz|7z-compressed|rar-compressed|compressed-tar)|vnd\.rar|zstd)$/;
const TEXTUAL = /^application\/(json|xml|yaml|x-yaml|toml|javascript|x-sh|x-shellscript|sql)$/;

export function entryIcon(entry: FolderEntry): IconName {
  if (entry.kind === "dir") return "folder";
  if (entry.kind === "other") return "unknown";
  const mime = entry.mime ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  if (ARCHIVE.test(mime)) return "archive";
  if (mime.startsWith("text/") || TEXTUAL.test(mime)) return "text";
  return "file";
}
