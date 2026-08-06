<template>
  <component :is="tag" v-bind="linkAttrs"
    class="not-prose group flex flex-col gap-1 border-2 border-purple-200 hover:border-purple-400 hover:bg-purple-50 bg-white p-4 no-underline transition-colors">
    <span class="flex items-center gap-2">
      <img v-if="favicon" :src="favicon" alt="" width="16" height="16" loading="lazy" class="w-4 h-4"
        @error="faviconFailed = true" />
      <LucideFileText v-else :size="14" class="text-purple-400" />
      <span class="font-poppins text-xs uppercase tracking-wide text-gray-500 truncate">{{ source }}</span>
      <component :is="isInternal ? internalIcon : externalIcon" :size="14"
        class="ml-auto shrink-0 text-gray-400 group-hover:text-purple-500" />
    </span>

    <span class="font-minecraft text-purple-600 leading-snug">{{ title }}</span>

    <span v-if="$slots.default" class="font-poppins text-sm text-gray-600 leading-snug [&_p]:m-0">
      <slot />
    </span>
  </component>
</template>

<script lang="ts" setup>
const props = defineProps<{
  url: string;
  title: string;
}>();

const internalIcon = resolveComponent('LucideArrowRight');
const externalIcon = resolveComponent('LucideExternalLink');

const faviconFailed = ref(false);
const isInternal = computed(() => props.url.startsWith('/'));

const tag = computed(() => (isInternal.value ? resolveComponent('NuxtLink') : 'a'));

const linkAttrs = computed(() => (isInternal.value
  ? { to: props.url }
  : { href: props.url, target: '_blank', rel: 'noopener noreferrer' }));

const host = computed(() => {
  if (isInternal.value) {
    return '';
  }

  try {
    return new URL(props.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
});

const source = computed(() => (isInternal.value ? 'sur ce blog' : host.value || props.url));

const favicon = computed(() => (
  !faviconFailed.value && host.value
    ? `https://www.google.com/s2/favicons?domain=${host.value}&sz=64`
    : ''
));
</script>
