import { expect, expectTypeOf, it } from "vitest";
import { DEFAULT_COLUMN_WIDTHS, DEFAULT_SORT, MIN_COLUMN_WIDTHS, formatModified, formatSize, joinPath, pathSegments, sortEntries, type FolderColumnWidths, type FolderEntry, type FolderSort } from "../src/model";

const e = (name: string, kind: FolderEntry["kind"] = "file"): FolderEntry =>
  ({ name, kind, symlink: false, size: null, modified: null, mime: null });

it("exported sort and width defaults are frozen and readonly", () => {
  expect([DEFAULT_SORT, DEFAULT_COLUMN_WIDTHS, MIN_COLUMN_WIDTHS].map(Object.isFrozen)).toEqual([true, true, true]);
  expectTypeOf(DEFAULT_SORT).toEqualTypeOf<Readonly<FolderSort>>();
  expectTypeOf(DEFAULT_COLUMN_WIDTHS).toEqualTypeOf<Readonly<FolderColumnWidths>>();
  expectTypeOf(MIN_COLUMN_WIDTHS).toEqualTypeOf<Readonly<FolderColumnWidths>>();
});

it("sortEntries puts folders first in natural, case-insensitive order", () => {
  const input = [e("b10.txt"), e("Zeta", "dir"), e("b2.txt"), e("alpha", "dir"), e("B1.txt"), e("x", "other"), e("a")];
  expect(sortEntries(input).map(x => x.name)).toEqual(["alpha", "Zeta", "a", "B1.txt", "b2.txt", "b10.txt", "x"]);
  expect(input.map(x => x.name)[0]).toBe("b10.txt");
});
it("sortEntries breaks ties on the raw name", () => {
  expect(sortEntries([e("readme"), e("README"), e("Readme")]).map(x => x.name)).toEqual(["README", "Readme", "readme"]);
});
it("formatSize uses SI units like GNOME", () => {
  expect([0, 1, 512, 999, 1000, 4096, 12_300_000, 1_000_000_000, 2_500_000_000_000].map(formatSize))
    .toEqual(["0 bytes", "1 byte", "512 bytes", "999 bytes", "1.0 kB", "4.1 kB", "12.3 MB", "1.0 GB", "2.5 TB"]);
});
it("formatModified follows GNOME Files' forms", () => {
  const now = new Date(2026, 9, 18, 19, 0, 0);
  const s = (d: Date) => Math.floor(d.getTime() / 1000);
  expect([
    formatModified(s(new Date(2026, 9, 18, 14, 32)), now),
    formatModified(s(new Date(2026, 9, 18, 0, 5)), now),
    formatModified(s(new Date(2026, 9, 17, 23, 59)), now),
    formatModified(s(new Date(2026, 9, 12, 8, 0)), now),
    formatModified(s(new Date(2026, 0, 2, 8, 0)), now),
    formatModified(s(new Date(2024, 9, 12, 8, 0)), now),
  ]).toEqual(["Today 14:32", "Today 00:05", "Yesterday 23:59", "12 Oct 2026", "2 Jan 2026", "12 Oct 2024"]);
});
it("joinPath", () => {
  expect([joinPath("/", "a"), joinPath("/a", "b"), joinPath("/a/", "b")]).toEqual(["/a", "/a/b", "/a/b"]);
});
it("pathSegments without home", () => {
  expect(pathSegments("/")).toEqual([{ label: "/", path: "/" }]);
  expect(pathSegments("/a/b")).toEqual([{ label: "/", path: "/" }, { label: "a", path: "/a" }, { label: "b", path: "/a/b" }]);
});
it("pathSegments collapses home", () => {
  expect(pathSegments("/home/me/dev/x", "/home/me")).toEqual([
    { label: "~", path: "/home/me" }, { label: "dev", path: "/home/me/dev" }, { label: "x", path: "/home/me/dev/x" },
  ]);
  expect(pathSegments("/home/me", "/home/me/")).toEqual([{ label: "~", path: "/home/me" }]);
  expect(pathSegments("/home/meow", "/home/me").map(x => x.label)).toEqual(["/", "home", "meow"]);
});
it("sortEntries by size and date keeps folders first and missing values last", () => {
  const f = (name: string, size: number | null, modified: number | null, kind: FolderEntry["kind"] = "file"): FolderEntry =>
    ({ name, kind, symlink: false, size, modified, mime: null });
  const input = [f("big", 900, 3), f("d2", null, 9, "dir"), f("small", 10, 1), f("none", null, null), f("d1", null, 1, "dir"), f("mid", 100, 2)];
  expect(sortEntries(input, { key: "size", descending: false }).map(x => x.name)).toEqual(["d1", "d2", "small", "mid", "big", "none"]);
  expect(sortEntries(input, { key: "size", descending: true }).map(x => x.name)).toEqual(["d1", "d2", "big", "mid", "small", "none"]);
  expect(sortEntries(input, { key: "modified", descending: true }).map(x => x.name)).toEqual(["d2", "d1", "big", "mid", "small", "none"]);
  expect(sortEntries(input, { key: "name", descending: true }).map(x => x.name)).toEqual(["d2", "d1", "small", "none", "mid", "big"]);
});
