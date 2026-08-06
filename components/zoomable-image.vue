<template>
  <img v-bind="$attrs" :src="src" :alt="alt" :width="width" :height="height" loading="lazy" role="button" tabindex="0"
    :aria-label="zoomLabel" class="cursor-zoom-in transition-opacity hover:opacity-90" @click="opened = true"
    @keydown.enter.prevent="opened = true" @keydown.space.prevent="opened = true" />

  <Teleport v-if="opened" to="body">
    <div class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/85 p-4 cursor-zoom-out"
      role="dialog" aria-modal="true" :aria-label="zoomLabel" @click="opened = false">
      <img :src="src" :alt="alt" class="max-h-[85vh] max-w-full object-contain" />
      <p v-if="alt" class="font-poppins text-sm text-white/80 text-center max-w-3xl">{{ alt }}</p>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  src?: string;
  alt?: string;
  width?: string | number;
  height?: string | number;
}>(), {
  src: '',
  alt: '',
  width: undefined,
  height: undefined,
});

const opened = ref(false);
const zoomLabel = computed(() => (props.alt ? `Agrandir : ${props.alt}` : 'Agrandir l\'image'));

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    opened.value = false;
  }
}

watch(opened, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : '';

  if (isOpen) {
    window.addEventListener('keydown', onKeydown);
  } else {
    window.removeEventListener('keydown', onKeydown);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});
</script>
