<template>
  <ol :class="depth === 1 ? 'space-y-2' : 'space-y-1 mt-1 pl-3 border-l-2 border-purple-200'">
    <li v-for="entry in entries" :key="entry.id">
      <a :href="`#${entry.id}`" class="block transition-colors" :class="[
        depth === 1 ? 'font-minecraft' : 'text-sm',
        entry.id === activeId ? 'text-purple-600 font-semibold' : 'text-gray-600 hover:text-purple-600',
      ]">
        {{ entry.text }}
      </a>
      <TocList v-if="entry.children.length" :entries="entry.children" :active-id="activeId" :depth="depth + 1" />
    </li>
  </ol>
</template>

<script lang="ts" setup>
import type { TocEntry } from '@/lib/utils/toc';

defineOptions({ name: 'TocList' });

withDefaults(defineProps<{
  entries: TocEntry[];
  activeId: string;
  depth?: number;
}>(), {
  depth: 1,
});
</script>
