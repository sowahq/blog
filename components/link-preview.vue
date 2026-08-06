<template>
  <span class="relative inline-block" @mouseenter="open" @mouseleave="close" @focusin="open" @focusout="close">
    <slot />

    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-100" leave-to-class="opacity-0">
      <span v-if="visible && preview"
        class="hidden md:block absolute z-50 top-full mt-2 w-80 bg-white border-2 border-purple-300 shadow-lg p-3 font-poppins text-left normal-case"
        :class="alignRight ? 'right-0' : 'left-0'">
        <img v-if="preview.image && !imageFailed" :src="preview.image" alt=""
          class="block w-full h-32 object-cover mb-2 border border-purple-100" loading="lazy"
          @error="imageFailed = true" />

        <span class="flex items-center gap-2 mb-1">
          <img :src="`https://www.google.com/s2/favicons?domain=${preview.host}&sz=64`" alt="" width="16" height="16"
            class="w-4 h-4" loading="lazy" />
          <span class="text-xs uppercase tracking-wide text-gray-500 truncate">{{ preview.host }}</span>
        </span>

        <span v-if="preview.title" class="block font-semibold text-sm text-purple-600 leading-snug line-clamp-2">
          {{ preview.title }}
        </span>

        <span v-if="preview.description" class="block text-xs text-gray-600 leading-snug mt-1 line-clamp-3">
          {{ preview.description }}
        </span>
      </span>
    </Transition>
  </span>
</template>

<script lang="ts" setup>
import type { LinkPreview } from '~/server/api/link-preview.get';

const OPEN_DELAY = 250;

const props = defineProps<{
  url: string;
}>();

const visible = ref(false);
const preview = ref<LinkPreview | null>(null);
const alignRight = ref(false);
const imageFailed = ref(false);

let timer: ReturnType<typeof setTimeout> | undefined;

function open(event: Event): void {
  const wrapper = event.currentTarget as HTMLElement | null;

  if (wrapper) {
    alignRight.value = wrapper.getBoundingClientRect().left + 320 > window.innerWidth;
  }

  clearTimeout(timer);

  timer = setTimeout(async () => {
    preview.value = await fetchLinkPreview(props.url);
    visible.value = true;
  }, OPEN_DELAY);
}

function close(): void {
  clearTimeout(timer);
  visible.value = false;
}

onBeforeUnmount(() => clearTimeout(timer));
</script>
