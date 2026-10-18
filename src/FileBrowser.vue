<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { entryIcon, ICONS } from "./icons";
import { formatModified, formatSize, joinPath, pathSegments, sortEntries, type FolderEntry, type FolderListing, type FolderLoader } from "./model";

const props = withDefaults(defineProps<{
  path: string;
  load: FolderLoader;
  select?: string | null;
  home?: string | null;
  homeLabel?: string;
  showHidden?: boolean;
}>(), { select: null, home: null, homeLabel: "~", showHidden: false });

const emit = defineEmits<{
  "open-folder": [path: string];
  "open-file": [path: string, entry: FolderEntry];
  "update:showHidden": [value: boolean];
}>();

/** Below this width the Size and Modified columns are dropped. */
const NARROW_PX = 448;

const root = ref<HTMLElement | null>(null);
const listing = shallowRef<FolderListing | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);
const narrow = ref(false);
// Every load takes a new generation; only the latest one may apply its result.
let generation = 0;
let observer: ResizeObserver | null = null;

async function reload(): Promise<void> {
  const mine = ++generation;
  loading.value = true;
  error.value = null;
  listing.value = null;
  try {
    const result = await props.load(props.path);
    if (mine !== generation) return;
    listing.value = result;
  } catch (e) {
    if (mine !== generation) return;
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (mine === generation) loading.value = false;
  }
  if (props.select) await revealSelected();
}

async function revealSelected(): Promise<void> {
  await nextTick();
  root.value?.querySelector(".vfb-row--selected")?.scrollIntoView({ block: "nearest" });
}

watch(() => props.path, () => { void reload(); });
watch(() => props.select, (value) => { if (value && listing.value) void revealSelected(); });

onMounted(() => {
  void reload();
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
  observer?.disconnect();
  observer = null;
});

const sorted = computed(() => listing.value ? sortEntries(listing.value.entries) : []);
const visible = computed(() => props.showHidden ? sorted.value : sorted.value.filter(e => !e.name.startsWith(".")));
const segments = computed(() => pathSegments(props.path, props.home).map(s => s.label === "~" && s.path !== "/" ? { ...s, label: props.homeLabel } : s));
const folderName = computed(() => segments.value[segments.value.length - 1]?.label ?? props.path);
const parent = computed(() => listing.value ? listing.value.parent : props.path === "/" ? null : undefined);

function open(entry: FolderEntry): void {
  const target = joinPath(listing.value?.path ?? props.path, entry.name);
  if (entry.kind === "dir") emit("open-folder", target);
  else emit("open-file", target, entry);
}
function goUp(): void {
  if (parent.value) emit("open-folder", parent.value);
}
const toggleHidden = () => emit("update:showHidden", !props.showHidden);
</script>

<template>
  <div ref="root" class="vfb-root" :class="{ 'vfb-narrow': narrow }">
    <div class="vfb-header">
      <button type="button" class="vfb-button vfb-up" :disabled="!parent" aria-label="Parent folder" title="Parent folder" @click="goUp">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS.up" /></svg>
      </button>
      <nav class="vfb-pathbar" aria-label="Location">
        <template v-for="(segment, index) in segments" :key="segment.path">
          <span v-if="index > 0 && segments[index - 1]!.path !== '/'" class="vfb-crumb-sep" aria-hidden="true">/</span>
          <span v-if="index === segments.length - 1" class="vfb-crumb vfb-crumb--current" aria-current="location" :title="segment.path">{{ segment.label }}</span>
          <button v-else type="button" class="vfb-crumb" :title="segment.path" @click="emit('open-folder', segment.path)">{{ segment.label }}</button>
        </template>
      </nav>
      <button type="button" class="vfb-button vfb-hidden-toggle" :aria-pressed="showHidden ? 'true' : 'false'" aria-label="Show hidden files" title="Show hidden files" @click="toggleHidden">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS.hidden" /></svg>
      </button>
      <button type="button" class="vfb-button vfb-reload" aria-label="Reload" title="Reload" @click="reload">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS.reload" /></svg>
      </button>
    </div>

    <div class="vfb-body">
      <div v-if="error !== null" class="vfb-state vfb-state--error" role="alert">
        <p class="vfb-state-message">{{ error }}</p>
        <button type="button" class="vfb-pill" @click="reload">Retry</button>
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
          <div class="vfb-columns" aria-hidden="true">
            <span class="vfb-col-name">Name</span><span class="vfb-col-size">Size</span><span class="vfb-col-modified">Modified</span>
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
                <span class="vfb-size">{{ entry.kind === 'file' && entry.size !== null ? formatSize(entry.size) : '' }}</span>
                <span class="vfb-modified">{{ entry.modified !== null ? formatModified(entry.modified) : '' }}</span>
              </button>
            </li>
          </ul>
          <p v-if="listing.truncated" class="vfb-truncated" role="note">Showing the first {{ listing.entries.length }} entries</p>
        </template>
      </template>
    </div>
  </div>
</template>
