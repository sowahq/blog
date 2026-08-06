<template>
  <LinkPreview v-if="isExternal" :url="href">
    <NuxtLink v-bind="$attrs" :href="href" :target="target ?? '_blank'" rel="noopener noreferrer">
      <slot />
    </NuxtLink>
  </LinkPreview>

  <NuxtLink v-else v-bind="$attrs" :href="href" :target="target">
    <slot />
  </NuxtLink>
</template>

<script lang="ts" setup>
import LinkPreview from '@/components/link-preview.vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  href?: string;
  target?: string;
}>(), {
  href: '',
  target: undefined,
});

const isExternal = computed(() => /^https?:\/\//.test(props.href));
</script>
