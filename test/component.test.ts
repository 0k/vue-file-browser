import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import FileBrowser from "../src/FileBrowser.vue";
import type { FolderEntry, FolderFeed, FolderFeedSink, FolderListing, FolderLoader } from "../src/model";

const wrappers: VueWrapper[] = [];
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); });

let observers: { cb: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];
const scrolled: string[] = [];
beforeEach(() => {
  observers = [];
  scrolled.length = 0;
  vi.stubGlobal("ResizeObserver", class {
    cb: ResizeObserverCallback; disconnect = vi.fn();
    constructor(cb: ResizeObserverCallback) { this.cb = cb; observers.push(this); }
    observe() {} unobserve() {}
  });
  Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.textContent ?? ""); };
});
afterEach(() => vi.unstubAllGlobals());

const today = new Date();
const NOW = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0).getTime() / 1000);
const entry = (name: string, kind: FolderEntry["kind"] = "file", extra: Partial<FolderEntry> = {}): FolderEntry =>
  ({ name, kind, symlink: false, size: kind === "file" ? 2048 : null, modified: NOW - 3600, mime: null, ...extra });
const listing = (path: string, entries: FolderEntry[], extra: Partial<FolderListing> = {}): FolderListing =>
  ({ path, parent: path === "/" ? null : path.replace(/\/[^/]+$/, "") || "/", entries, truncated: false, ...extra });

function view(props: Record<string, unknown>) {
  const w = mount(FileBrowser, { props: { path: "/home/me/w", ...props } as never, attachTo: document.body });
  wrappers.push(w);
  return w;
}
function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const rows = (w: VueWrapper) => w.findAll(".vfb-row").map(r => [r.get(".vfb-name").text(), r.get(".vfb-size").text(), r.get(".vfb-modified").text()]);

it("loads the path on mount and renders sorted rows", async () => {
  const load = vi.fn<FolderLoader>(async p => listing(p, [entry("b.txt"), entry("src", "dir"), entry("other", "other")]));
  const w = view({ load });
  await flushPromises();
  expect(load.mock.calls).toEqual([["/home/me/w"]]);
  expect(rows(w)).toEqual([["src", "", "11:00"], ["b.txt", "2.0 kB", "11:00"], ["other", "", "11:00"]]);
  expect(w.get(".vfb-list").attributes("aria-label")).toBe("w");
});
it("loads again when the path changes and ignores stale results", async () => {
  const first = deferred<FolderListing>();
  const load = vi.fn<FolderLoader>(p => p === "/a" ? first.promise : Promise.resolve(listing(p, [entry("new")])));
  const w = view({ load, path: "/a" });
  await w.setProps({ path: "/b" });
  await flushPromises();
  first.resolve(listing("/a", [entry("old")]));
  await flushPromises();
  expect(load.mock.calls).toEqual([["/a"], ["/b"]]);
  expect(rows(w).map(r => r[0])).toEqual(["new"]);
});
it("ignores a result arriving after unmount", async () => {
  const d = deferred<FolderListing>();
  const w = view({ load: () => d.promise });
  w.unmount(); wrappers.length = 0;
  d.resolve(listing("/home/me/w", [entry("x")]));
  await flushPromises();
  expect(observers[0]!.disconnect).toHaveBeenCalled();
});
it("hides dot entries unless showHidden, and toggles via update:showHidden", async () => {
  const w = view({ load: async (p: string) => listing(p, [entry(".env"), entry("a")]) });
  await flushPromises();
  expect(rows(w).map(r => r[0])).toEqual(["a"]);
  await w.get("button.vfb-hidden-toggle").trigger("click");
  expect(w.emitted("update:showHidden")).toEqual([[true]]);
  await w.setProps({ showHidden: true });
  expect(rows(w).map(r => r[0])).toEqual([".env", "a"]);
  expect(w.get("button.vfb-hidden-toggle").attributes("aria-pressed")).toBe("true");
});
it("offers to show hidden files when only hidden ones exist", async () => {
  const w = view({ load: async (p: string) => listing(p, [entry(".a")]) });
  await flushPromises();
  expect([w.get(".vfb-state-message").text(), w.get(".vfb-state button").text()]).toEqual(["Only hidden files", "Show hidden files"]);
  await w.get(".vfb-state button").trigger("click");
  expect(w.emitted("update:showHidden")).toEqual([[true]]);
});
it("shows the empty state", async () => {
  const w = view({ load: async (p: string) => listing(p, []) });
  await flushPromises();
  expect(w.get(".vfb-state-message").text()).toBe("Folder is empty");
});
it("shows the loader's error verbatim and retries", async () => {
  const load = vi.fn<FolderLoader>().mockRejectedValueOnce(new Error("permission denied: /root")).mockResolvedValue(listing("/home/me/w", [entry("ok")]));
  const w = view({ load });
  await flushPromises();
  expect([w.get(".vfb-state--error .vfb-state-message").text(), w.get(".vfb-state--error button").text(), w.get(".vfb-state--error").attributes("role")]).toEqual(["permission denied: /root", "Retry", "alert"]);
  await w.get(".vfb-state--error button").trigger("click");
  await flushPromises();
  expect(load).toHaveBeenCalledTimes(2);
  expect(rows(w).map(r => r[0])).toEqual(["ok"]);
});
it("shows a synchronous loader error verbatim and Retry restarts the load", async () => {
  const load = vi.fn<FolderLoader>().mockImplementationOnce(() => { throw new Error("load failed synchronously"); })
    .mockResolvedValue(listing("/home/me/w", [entry("ok")]));
  const w = view({ load });
  await flushPromises();
  expect(w.get(".vfb-state--error .vfb-state-message").text()).toBe("load failed synchronously");
  expect(w.get(".vfb-state--error button").text()).toBe("Retry");
  await w.get(".vfb-state--error button").trigger("click");
  await flushPromises();
  expect([load.mock.calls.length, rows(w).map(r => r[0])]).toEqual([2, ["ok"]]);
});
it.each([undefined, null, {}])("shows an error and Retry for a non-promise loader return: %s", async result => {
  const w = view({ load: () => result });
  await flushPromises();
  expect(w.get(".vfb-state--error .vfb-state-message").text().length).toBeGreaterThan(0);
  expect(w.get(".vfb-state--error button").text()).toBe("Retry");
  expect(w.find(".vfb-state[role=status]").exists()).toBe(false);
});
it("shows a synchronous feed error verbatim and Retry restarts the feed", async () => {
  const stop = vi.fn();
  const feed = vi.fn<FolderFeed>().mockImplementationOnce(() => { throw "feed failed synchronously"; })
    .mockImplementation((path, sink) => { sink.listing(listing(path, [entry("ok")])); return stop; });
  const w = view({ feed });
  await flushPromises();
  expect(w.get(".vfb-state--error .vfb-state-message").text()).toBe("feed failed synchronously");
  expect(w.get(".vfb-state--error button").text()).toBe("Retry");
  await w.get(".vfb-state--error button").trigger("click");
  await flushPromises();
  expect([feed.mock.calls.length, rows(w).map(r => r[0])]).toEqual([2, ["ok"]]);
  w.unmount(); wrappers.length = 0;
  expect(stop).toHaveBeenCalledTimes(1);
});
it.each([undefined, null, {}])("ignores a non-function feed stop on restart and teardown: %s", async stop => {
  const feed = vi.fn((path: string, sink: FolderFeedSink) => { sink.listing(listing(path, [entry(path)])); return stop; });
  const w = view({ feed, path: "/a" });
  await w.setProps({ path: "/b" });
  await flushPromises();
  expect([feed.mock.calls.length, rows(w).map(r => r[0])]).toEqual([2, ["/b"]]);
  expect(() => { w.unmount(); wrappers.length = 0; }).not.toThrow();
});
it("has no Reload button", async () => {
  const w = view({ load: async (p: string) => listing(p, []) });
  await flushPromises();
  expect(w.find(".vfb-reload").exists()).toBe(false);
  expect(w.findAll(".vfb-header > button").map(b => b.attributes("aria-label") ?? b.text())).toEqual(["Parent folder", "Show hidden files"]);
});
function fakeFeed() {
  const feeds: { path: string; sink: FolderFeedSink; stop: ReturnType<typeof vi.fn> }[] = [];
  const feed = (path: string, sink: FolderFeedSink) => { const stop = vi.fn(); feeds.push({ path, sink, stop }); return stop; };
  return { feeds, feed };
}
it("with a feed, shows what the feed delivers and fetches nothing itself", async () => {
  const { feeds, feed } = fakeFeed();
  const load = vi.fn<FolderLoader>();
  const w = view({ feed, load, select: "a" });
  await flushPromises();
  expect([feeds.map(f => f.path), load.mock.calls.length, w.find(".vfb-state[role=status]").text()]).toEqual([["/home/me/w"], 0, "Loading…"]);
  feeds[0]!.sink.listing(listing("/home/me/w", [entry("a")]));
  await flushPromises();
  expect([rows(w).map(r => r[0]), scrolled.length]).toEqual([["a"], 1]);
  // A change replaces the rows in place; the selection is not scrolled to again.
  feeds[0]!.sink.listing(listing("/home/me/w", [entry("a"), entry("b")]));
  await flushPromises();
  expect([rows(w).map(r => r[0]), scrolled.length, load.mock.calls.length]).toEqual([["a", "b"], 1, 0]);
});
it("switches the feed with the path, ignores the old one, and stops on unmount", async () => {
  const { feeds, feed } = fakeFeed();
  const w = view({ feed });
  await w.setProps({ path: "/home/me/x" });
  feeds[0]!.sink.listing(listing("/home/me/w", [entry("stale")]));
  feeds[1]!.sink.listing(listing("/home/me/x", [entry("fresh")]));
  await flushPromises();
  expect([feeds.map(f => f.path), feeds[0]!.stop.mock.calls.length, rows(w).map(r => r[0])]).toEqual([["/home/me/w", "/home/me/x"], 1, ["fresh"]]);
  w.unmount(); wrappers.length = 0;
  expect(feeds[1]!.stop).toHaveBeenCalledTimes(1);
});
it("does not restart the active feed when load changes, but still restarts on path changes", async () => {
  const { feeds, feed } = fakeFeed();
  const load = vi.fn<FolderLoader>();
  const replacement = vi.fn<FolderLoader>();
  const w = view({ feed, load, path: "/a" });
  feeds[0]!.sink.listing(listing("/a", [entry("current")]));
  await w.setProps({ load: replacement });
  expect([feeds.length, feeds[0]!.stop.mock.calls.length, rows(w).map(r => r[0])]).toEqual([1, 0, ["current"]]);
  await w.setProps({ path: "/b" });
  expect([feeds.map(f => f.path), feeds[0]!.stop.mock.calls.length, load.mock.calls.length, replacement.mock.calls.length]).toEqual([["/a", "/b"], 1, 0, 0]);
});
it("restarts when the active load reference changes", async () => {
  const load = vi.fn<FolderLoader>(async path => listing(path, [entry("old")]));
  const replacement = vi.fn<FolderLoader>(async path => listing(path, [entry("new")]));
  const w = view({ load });
  await flushPromises();
  await w.setProps({ load: replacement });
  await flushPromises();
  expect([load.mock.calls.length, replacement.mock.calls.length, rows(w).map(r => r[0])]).toEqual([1, 1, ["new"]]);
});
it("restarts when the active feed reference changes and switches to load when feed is removed", async () => {
  const first = fakeFeed();
  const second = fakeFeed();
  const load = vi.fn<FolderLoader>(async path => listing(path, [entry("loaded")]));
  const w = view({ feed: first.feed, load });
  await w.setProps({ feed: second.feed });
  expect([first.feeds[0]!.stop.mock.calls.length, second.feeds.length]).toEqual([1, 1]);
  await w.setProps({ feed: null });
  await flushPromises();
  expect([second.feeds[0]!.stop.mock.calls.length, load.mock.calls.length, rows(w).map(r => r[0])]).toEqual([1, 1, ["loaded"]]);
});
it("shows a feed error, recovers when the feed delivers again, and Retry restarts the feed", async () => {
  const { feeds, feed } = fakeFeed();
  const w = view({ feed });
  feeds[0]!.sink.error('path does not exist: "/home/me/w"');
  await flushPromises();
  expect(w.get(".vfb-state--error .vfb-state-message").text()).toBe('path does not exist: "/home/me/w"');
  feeds[0]!.sink.listing(listing("/home/me/w", [entry("back")]));
  await flushPromises();
  expect(rows(w).map(r => r[0])).toEqual(["back"]);
  feeds[0]!.sink.error("permission denied");
  await flushPromises();
  await w.get(".vfb-state--error button").trigger("click");
  expect([feeds.length, feeds[0]!.stop.mock.calls.length]).toEqual([2, 1]);
});
it("notes a truncated listing", async () => {
  const w = view({ load: async (p: string) => listing(p, [entry("a"), entry("b")], { truncated: true }) });
  await flushPromises();
  expect(w.get(".vfb-truncated").text()).toBe("Showing the first 2 entries");
});
it("emits open-folder and open-file", async () => {
  const other = entry("sock", "other");
  const file = entry("a.md", "file", { mime: "text/markdown" });
  const w = view({ load: async (p: string) => listing(p, [entry("d", "dir"), file, other]) });
  await flushPromises();
  const buttons = w.findAll(".vfb-row");
  await buttons[0]!.trigger("click");
  await buttons[1]!.trigger("click");
  await buttons[2]!.trigger("click");
  expect(w.emitted("open-folder")).toEqual([["/home/me/w/d"]]);
  expect(w.emitted("open-file")).toEqual([["/home/me/w/a.md", file], ["/home/me/w/sock", other]]);
});
it("Up opens the parent and is disabled at the root", async () => {
  const w = view({ load: async (p: string) => listing(p, []) });
  await flushPromises();
  await w.get("button.vfb-up").trigger("click");
  expect(w.emitted("open-folder")).toEqual([["/home/me"]]);
  await w.setProps({ path: "/" });
  await flushPromises();
  expect(w.get("button.vfb-up").attributes("disabled")).toBe("");
});
it("path bar collapses home and opens ancestors", async () => {
  const w = view({ path: "/home/me/w/sub", home: "/home/me", homeLabel: "Home", load: async (p: string) => listing(p, []) });
  await flushPromises();
  expect(w.findAll(".vfb-crumb").map(c => [c.text(), c.element.tagName])).toEqual([["Home", "BUTTON"], ["w", "BUTTON"], ["sub", "SPAN"]]);
  await w.findAll(".vfb-crumb")[1]!.trigger("click");
  expect(w.emitted("open-folder")).toEqual([["/home/me/w"]]);
});
it("highlights and scrolls to the selected entry", async () => {
  const w = view({ select: "b", load: async (p: string) => listing(p, [entry("a"), entry("b")]) });
  await flushPromises();
  const sel = w.findAll(".vfb-row--selected");
  expect(sel.map(r => [r.get(".vfb-name").text(), r.attributes("aria-current")])).toEqual([["b", "true"]]);
  expect(scrolled.length).toBe(1);
  expect(scrolled[0]).toContain("b");
});
it("switches to the narrow layout below 28rem", async () => {
  const w = view({ load: async (p: string) => listing(p, []) });
  await flushPromises();
  const fire = (width: number) => observers[0]!.cb([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
  fire(300); await flushPromises();
  expect(w.classes()).toContain("vfb-narrow");
  fire(900); await flushPromises();
  expect(w.classes()).not.toContain("vfb-narrow");
});
