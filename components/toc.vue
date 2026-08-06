<template>
  <nav v-if="entries.length" aria-label="Sommaire"
    class="bg-white shadow-pixel-art p-6 font-poppins text-base max-h-72 overflow-y-auto xl:max-h-[calc(100vh-6rem)]">
    <h2 class="font-minecraft text-lg text-purple-500 mb-4 flex items-center gap-2">
      <LucideList :size="18" />
      Sommaire
    </h2>
    <TocList :entries="entries" :active-id="activeId" />
  </nav>
</template>

<script lang="ts" setup>
import type { MarkdownRoot } from '@nuxt/content';
import TocList from '@/components/toc-list.vue';
import { buildToc, flattenToc } from '@/lib/utils/toc';

const props = defineProps<{
  body?: MarkdownRoot;
}>();

const entries = computed(() => buildToc(props.body));
const activeId = ref('');

let headings: HTMLElement[] = [];
let frame = 0;

function syncActiveId(): void {
  frame = 0;

  const passed = headings.filter((heading) => heading.getBoundingClientRect().top <= 120);
  activeId.value = (passed[passed.length - 1] ?? headings[0])?.id ?? '';
}

function onScroll(): void {
  if (!frame) {
    frame = requestAnimationFrame(syncActiveId);
  }
}

onMounted(() => {
  headings = flattenToc(entries.value)
    .map((entry) => document.getElementById(entry.id))
    .filter((element): element is HTMLElement => element !== null);

  syncActiveId();
  window.addEventListener('scroll', onScroll, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);

  if (frame) {
    cancelAnimationFrame(frame);
  }
});
</script>
