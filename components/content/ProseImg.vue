<template>
  <ZoomableImage :src="src" :alt="alt" :width="width" :height="height" />
</template>

<script lang="ts" setup>
import ZoomableImage from '@/components/zoomable-image.vue';

withDefaults(defineProps<{
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
</script>
