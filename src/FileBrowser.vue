<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { entryIcon, ICONS } from "./icons";
import {
  DEFAULT_COLUMN_WIDTHS, DEFAULT_SORT, clampColumnWidth, formatModified, joinPath, modifiedParts, sizeParts, MONTHS, pathSegments, sortEntries,
  type FolderColumnWidths, type FolderEntry, type FolderListing, type FolderLoader, type FolderSort, type FolderSortKey, type FolderFeed,
} from "./model";

/**
 * Exactly one source of listings: `load` (fetched on demand) or `feed`
 * (the host pushes every listing, e.g. from a live channel).
 */
const props = withDefaults(defineProps<{
  path: string;
  load?: FolderLoader | null;
  feed?: FolderFeed | null;
  select?: string | null;
  home?: string | null;
  homeLabel?: string;
  showHidden?: boolean;
  sort?: FolderSort;
  /** Null (the default): Size and Modified fit their widest content. */
  columnWidths?: FolderColumnWidths | null;
}>(), {
  load: null, feed: null, select: null, home: null, homeLabel: "~", showHidden: false,
  sort: () => DEFAULT_SORT, columnWidths: null,
});

const emit = defineEmits<{
  "open-folder": [path: string];
  "open-file": [path: string, entry: FolderEntry];
  "update:showHidden": [value: boolean];
  "update:sort": [value: FolderSort];
  "update:columnWidths": [value: FolderColumnWidths];
}>();

/** Below this width the Size and Modified columns are dropped. */
const NARROW_PX = 448;
const ICON_COLUMN = "16px";

const root = ref<HTMLElement | null>(null);
/**
 * Hidden probes measured in the current font: the month names (the month
 * slot fits the widest), and the widest size, dates and column labels
 * (Size and Modified fit their content unless the host gives widths).
 */
const measure = ref<HTMLElement | null>(null);
const monthWidth = ref<number | null>(null);
const fittedWidths = ref<FolderColumnWidths | null>(null);
const listing = shallowRef<FolderListing | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);
const narrow = ref(false);
/** Widths while a column separator is being dragged; null otherwise. */
const dragWidths = ref<FolderColumnWidths | null>(null);
// Every start (load or feed) takes a new generation; only results of the
// latest one may apply.
let generation = 0;
let observer: ResizeObserver | null = null;
let stopFeed: (() => void) | null = null;
let endDrag: (() => void) | null = null;
let suppressSortClick = false;
let suppressSortTimer: number | null = null;

function apply(mine: number, result: FolderListing): void {
  if (mine !== generation) return;
  const first = listing.value === null;
  listing.value = result;
  error.value = null;
  loading.value = false;
  if (first && props.select) void revealSelected();
}
function fail(mine: number, message: string): void {
  if (mine !== generation) return;
  listing.value = null;
  error.value = message;
  loading.value = false;
}

/** Show the folder from scratch: from the feed when there is one, else by loading it. */
function start(): void {
  const mine = ++generation;
  stopFeed?.();
  stopFeed = null;
  loading.value = true;
  error.value = null;
  listing.value = null;
  try {
    if (props.feed) {
      const stop = props.feed(props.path, {
        listing: (result) => apply(mine, result),
        error: (message) => fail(mine, message),
      });
      stopFeed = typeof stop === "function" ? stop : null;
    } else if (props.load) {
      props.load(props.path).then(
        (result) => apply(mine, result),
        (e: unknown) => fail(mine, e instanceof Error ? e.message : String(e)),
      );
    } else {
      fail(mine, "No folder source: pass load or feed");
    }
  } catch (e: unknown) {
    fail(mine, e instanceof Error ? e.message : String(e));
  }
}

async function revealSelected(): Promise<void> {
  await nextTick();
  root.value?.querySelector(".vfb-row--selected")?.scrollIntoView({ block: "nearest" });
}

watch([() => props.path, () => props.feed ?? props.load], start);
watch(() => props.select, (value) => { if (value && listing.value) void revealSelected(); });

const probeWidth = (el: Element | null | undefined) => el ? el.getBoundingClientRect().width : 0;

function measureSlots(): void {
  const probes = measure.value;
  if (!probes) return;
  const months = Array.from(probes.querySelector("[data-probe=months]")?.children ?? []);
  const widest = Math.max(0, ...months.map(probeWidth));
  // jsdom and unrendered roots measure 0: keep the stylesheet fallbacks.
  monthWidth.value = widest > 0 ? Math.ceil(widest) : null;
  const of = (name: string) => probeWidth(probes.querySelector(`[data-probe=${name}]`));
  const size = Math.max(of("size"), of("size-label"));
  const modified = Math.max(of("date"), of("relative"), of("modified-label"));
  fittedWidths.value = size > 0 && modified > 0 ? { size: Math.ceil(size), modified: Math.ceil(modified) } : null;
}

onMounted(() => {
  start();
  measureSlots();
  // Web fonts may finish loading after mount and change the widths.
  void (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(() => { if (root.value) measureSlots(); });
  if (typeof ResizeObserver !== "undefined" && root.value) {
    observer = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width;
      if (width !== undefined) narrow.value = width < NARROW_PX;
    });
    observer.observe(root.value);
  }
});
onBeforeUnmount(() => {
  generation += 1;
  stopFeed?.();
  stopFeed = null;
  observer?.disconnect();
  observer = null;
  endDrag?.();
  if (suppressSortTimer !== null) window.clearTimeout(suppressSortTimer);
  suppressSortTimer = null;
});

const sorted = computed(() => listing.value ? sortEntries(listing.value.entries, activeSort.value) : []);
const visible = computed(() => props.showHidden ? sorted.value : sorted.value.filter(e => !e.name.startsWith(".")));
const segments = computed(() => pathSegments(props.path, props.home).map(s => s.label === "~" && s.path !== "/" ? { ...s, label: props.homeLabel } : s));
const folderName = computed(() => segments.value[segments.value.length - 1]?.label ?? props.path);
const parent = computed(() => listing.value ? listing.value.parent : props.path === "/" ? null : undefined);
/** The sort in effect (withDefaults guarantees it; the template needs it non-optional). */
const activeSort = computed<FolderSort>(() => props.sort ?? DEFAULT_SORT);
const widths = computed<FolderColumnWidths>(() => {
  if (dragWidths.value) return dragWidths.value;
  const fallback = fittedWidths.value ?? DEFAULT_COLUMN_WIDTHS;
  const stored = props.columnWidths;
  if (!stored) return fallback;
  return {
    size: clampColumnWidth("size", Number.isFinite(stored.size) ? stored.size : fallback.size),
    modified: clampColumnWidth("modified", Number.isFinite(stored.modified) ? stored.modified : fallback.modified),
  };
});
/** One column template shared by the header and every row, so they align. */
const columns = computed(() => narrow.value
  ? `${ICON_COLUMN} minmax(0, 1fr)`
  : `${ICON_COLUMN} minmax(0, 1fr) ${widths.value.size}px ${widths.value.modified}px`);

const isHome = (path: string) => !!props.home && path === pathSegments(props.home, props.home)[0]?.path;

function open(entry: FolderEntry): void {
  const target = joinPath(listing.value?.path ?? props.path, entry.name);
  if (entry.kind === "dir") emit("open-folder", target);
  else emit("open-file", target, entry);
}
function goUp(): void {
  if (parent.value) emit("open-folder", parent.value);
}
const toggleHidden = () => emit("update:showHidden", !props.showHidden);

function sortBy(key: FolderSortKey): void {
  if (suppressSortClick) { suppressSortClick = false; return; }
  const descending = activeSort.value.key === key ? !activeSort.value.descending : key === "modified";
  emit("update:sort", { key, descending });
}
function ariaSort(key: FolderSortKey): "ascending" | "descending" | "none" {
  return activeSort.value.key !== key ? "none" : activeSort.value.descending ? "descending" : "ascending";
}

/**
 * Drag the separator on the left of a column: Name takes the remaining
 * space, so moving the separator left widens the column on its right.
 */
function startResize(column: keyof FolderColumnWidths, event: PointerEvent): void {
  event.preventDefault();
  endDrag?.();
  if (suppressSortTimer !== null) window.clearTimeout(suppressSortTimer);
  suppressSortTimer = null;
  suppressSortClick = false;
  const startX = event.clientX;
  const start = { ...widths.value };
  dragWidths.value = start;
  const move = (e: PointerEvent) => {
    if (e.clientX !== startX) suppressSortClick = true;
    dragWidths.value = { ...start, [column]: clampColumnWidth(column, start[column] - (e.clientX - startX)) };
  };
  const up = () => {
    const final = dragWidths.value;
    endDrag?.();
    if (suppressSortClick) {
      // The pointer's follow-up click gets this task; later clicks must sort.
      suppressSortTimer = window.setTimeout(() => {
        suppressSortClick = false;
        suppressSortTimer = null;
      }, 0);
    }
    if (final && (final.size !== start.size || final.modified !== start.modified)) emit("update:columnWidths", final);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  endDrag = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    dragWidths.value = null;
    endDrag = null;
  };
}
</script>

<template>
  <div ref="root" class="vfb-root" :class="{ 'vfb-narrow': narrow }" :style="{ '--vfb-columns': columns, ...(monthWidth !== null ? { '--vfb-month-width': `${monthWidth}px` } : {}) }">
    <div ref="measure" class="vfb-measure" aria-hidden="true">
      <span data-probe="months"><span v-for="m in MONTHS" :key="m">{{ ' ' + m }}</span></span>
      <span data-probe="size" class="vfb-size"><span class="vfb-size-whole">999</span><span class="vfb-size-fraction">.9</span><span class="vfb-size-unit"> bytes</span></span>
      <span data-probe="date" class="vfb-modified"><span class="vfb-date-day">00</span><span class="vfb-date-month"> May</span><span class="vfb-date-year"> 0000</span></span>
      <span data-probe="relative" class="vfb-modified"><span class="vfb-date-word">Yesterday</span><span class="vfb-date-time"> 00:00</span></span>
      <span data-probe="size-label" class="vfb-probe-label">Size<span class="vfb-sort-arrow">▼</span></span>
      <span data-probe="modified-label" class="vfb-probe-label">Modified<span class="vfb-sort-arrow">▼</span></span>
    </div>
    <div class="vfb-header">
      <button type="button" class="vfb-button vfb-up" :disabled="!parent" aria-label="Parent folder" title="Parent folder" @click="goUp">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS.up" /></svg>
      </button>
      <nav class="vfb-pathbar" aria-label="Location">
        <template v-for="(segment, index) in segments" :key="segment.path">
          <span v-if="index > 0 && segments[index - 1]!.path !== '/'" class="vfb-crumb-sep" aria-hidden="true">/</span>
          <span v-if="index === segments.length - 1" class="vfb-crumb vfb-crumb--current" aria-current="location" :title="segment.path"><svg v-if="isHome(segment.path)" class="vfb-crumb-home" viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS.home" /></svg>{{ segment.label }}</span>
          <button v-else type="button" class="vfb-crumb" :title="segment.path" @click="emit('open-folder', segment.path)"><svg v-if="isHome(segment.path)" class="vfb-crumb-home" viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS.home" /></svg>{{ segment.label }}</button>
        </template>
      </nav>
      <button type="button" class="vfb-button vfb-hidden-toggle" :aria-pressed="showHidden ? 'true' : 'false'" aria-label="Show hidden files" title="Show hidden files" @click="toggleHidden">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS.hidden" /></svg>
      </button>
    </div>

    <div class="vfb-body">
      <div v-if="error !== null" class="vfb-state vfb-state--error" role="alert">
        <p class="vfb-state-message">{{ error }}</p>
        <button type="button" class="vfb-pill" @click="start()">Retry</button>
      </div>
      <div v-else-if="loading" class="vfb-state" role="status"><span class="vfb-spinner" aria-hidden="true"></span><p class="vfb-state-message">Loading…</p></div>
      <template v-else-if="listing">
        <div v-if="!sorted.length" class="vfb-state" role="status">
          <svg class="vfb-state-icon" viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS.folder" /></svg>
          <p class="vfb-state-message">Folder is empty</p>
        </div>
        <div v-else-if="!visible.length" class="vfb-state" role="status">
          <svg class="vfb-state-icon" viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS.hidden" /></svg>
          <p class="vfb-state-message">Only hidden files</p>
          <button type="button" class="vfb-pill" @click="emit('update:showHidden', true)">Show hidden files</button>
        </div>
        <template v-else>
          <div class="vfb-columns" role="row">
            <button type="button" class="vfb-col vfb-col-name" role="columnheader" :aria-sort="ariaSort('name')" @click="sortBy('name')">
              Name<span v-if="activeSort.key === 'name'" class="vfb-sort-arrow" aria-hidden="true">{{ activeSort.descending ? '▼' : '▲' }}</span>
            </button>
            <button type="button" class="vfb-col vfb-col-size" role="columnheader" :aria-sort="ariaSort('size')" @click="sortBy('size')">
              <span class="vfb-resize" aria-hidden="true" @pointerdown="startResize('size', $event)" @click.stop="suppressSortClick = false"></span>
              Size<span v-if="activeSort.key === 'size'" class="vfb-sort-arrow" aria-hidden="true">{{ activeSort.descending ? '▼' : '▲' }}</span>
            </button>
            <button type="button" class="vfb-col vfb-col-modified" role="columnheader" :aria-sort="ariaSort('modified')" @click="sortBy('modified')">
              <span class="vfb-resize" aria-hidden="true" @pointerdown="startResize('modified', $event)" @click.stop="suppressSortClick = false"></span>
              Modified<span v-if="activeSort.key === 'modified'" class="vfb-sort-arrow" aria-hidden="true">{{ activeSort.descending ? '▼' : '▲' }}</span>
            </button>
          </div>
          <ul class="vfb-list" :aria-label="folderName">
            <li v-for="entry in visible" :key="entry.name">
              <button
                type="button"
                class="vfb-row"
                :class="{ 'vfb-row--selected': entry.name === select, 'vfb-row--dir': entry.kind === 'dir' }"
                :aria-current="entry.name === select ? 'true' : undefined"
                :title="entry.name"
                @click="open(entry)"
              >
                <span class="vfb-icon" :class="`vfb-icon--${entryIcon(entry)}`" aria-hidden="true">
                  <svg viewBox="0 0 16 16"><path :d="ICONS[entryIcon(entry)]" /></svg>
                  <svg v-if="entry.symlink" class="vfb-emblem" viewBox="0 0 16 16"><path :d="ICONS.link" /></svg>
                </span>
                <span class="vfb-name">{{ entry.name }}</span>
                <span class="vfb-size">
                  <template v-if="entry.kind === 'file' && entry.size !== null">
                    <span class="vfb-size-whole">{{ sizeParts(entry.size).whole }}</span><span class="vfb-size-fraction">{{ sizeParts(entry.size).fraction }}</span><span class="vfb-size-unit">{{ ' ' + sizeParts(entry.size).unit }}</span>
                  </template>
                </span>
                <span class="vfb-modified" :title="entry.modified !== null ? formatModified(entry.modified) : undefined">
                  <template v-if="entry.modified !== null">
                    <template v-for="p in [modifiedParts(entry.modified)]" :key="p.form">
                      <template v-if="p.form === 'relative'"><span class="vfb-date-word">{{ p.word }}</span><span class="vfb-date-time">{{ ' ' + p.time }}</span></template>
                      <template v-else><span class="vfb-date-day">{{ p.day }}</span><span class="vfb-date-month">{{ ' ' + p.month }}</span><span class="vfb-date-year">{{ ' ' + p.year }}</span></template>
                    </template>
                  </template>
                </span>
              </button>
            </li>
          </ul>
          <p v-if="listing.truncated" class="vfb-truncated" role="note">Showing the first {{ listing.entries.length }} entries</p>
        </template>
      </template>
    </div>
  </div>
</template>
