import { expect, it } from "vitest";
import { formatModified, formatSize, joinPath, pathSegments, sortEntries, type FolderEntry } from "../src/model";

const e = (name: string, kind: FolderEntry["kind"] = "file"): FolderEntry =>
  ({ name, kind, symlink: false, size: null, modified: null, mime: null });

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
it("formatModified follows GNOME's relative forms", () => {
  const now = new Date(2026, 9, 18, 19, 0, 0);
  const s = (d: Date) => Math.floor(d.getTime() / 1000);
  expect([
    formatModified(s(new Date(2026, 9, 18, 14, 32)), now),
    formatModified(s(new Date(2026, 9, 18, 0, 5)), now),
    formatModified(s(new Date(2026, 9, 17, 23, 59)), now),
    formatModified(s(new Date(2026, 9, 12, 8, 0)), now),
    formatModified(s(new Date(2026, 0, 2, 8, 0)), now),
    formatModified(s(new Date(2024, 9, 12, 8, 0)), now),
  ]).toEqual(["14:32", "00:05", "Yesterday", "12 Oct", "2 Jan", "12 Oct 2024"]);
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
