<template>
  <div v-if="post" class="max-w-4xl xl:max-w-6xl mx-auto px-8 pb-12 font-poppins">
    <div class="mt-8 mb-4">
      <NuxtLink to="/" class="inline-flex items-center gap-2 text-purple-600 hover:text-purple-800 transition-colors font-minecraft">
        <LucideArrowLeft :size="18" />
        Retour à l'accueil
      </NuxtLink>
    </div>
    <header class="mb-8 space-y-3 mt-4">
      <p class="text-gray-600 font-minecraft">{{ dayjs(post.pubDate).format('DD MMMM YYYY') }}
        &bull; {{ post.readingTime }} minute{{ post.readingTime > 1 ? "s" : "" }} de lecture</p>
      <h1 class="text-4xl font-bold mb-2 font-minecraft">{{ post.title }}</h1>
      <p class="text-gray-600 space-y-1 font-minecraft">Tags: <span v-for="tag in post.tags" :key="tag"
          class="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-white bg-purple-400 mr-2">{{
          tag }}</span></p>
      <img :src="post.image" alt="Post image" class="w-full h-auto object-contain mt-4 rounded-lg" />
    </header>

    <div class="flex flex-col xl:flex-row-reverse xl:items-start xl:gap-10">
      <aside class="w-full mb-10 xl:mb-0 xl:w-72 xl:shrink-0 xl:sticky xl:top-8">
        <Toc :body="post.body" />
      </aside>

      <article class="prose prose-headings:scroll-mt-8 prose-strong:text-purple-600 prose-a:text-purple-600 prose-a:no-underline hover:prose-a:underline prose-blockquote:border-purple-400 prose-blockquote:text-gray-700 prose-code:bg-yellow-300 prose-code:text-purple-600 prose-code:border prose-code:border-purple-600 prose-code:rounded prose-code:px-1 [&_pre_code]:!bg-transparent [&_pre_code]:!text-inherit [&_pre_code]:!rounded-none [&_pre_code]:!px-0 [&_pre_code]:!border-0 prose-code:before:content-none prose-code:after:content-none prose-pre:!px-4 prose-pre:!py-3 prose-pre:!bg-[#1a1b26] max-w-full prose-hr:border-gray-600 prose-li:marker:text-black font-poppins text-lg leading-relaxed min-w-0 flex-1">
        <ContentRendererMarkdown :value="post">
          <template #empty>
            <p>Aucun contenu pour cet article.</p>
          </template>
        </ContentRendererMarkdown>
      </article>
    </div>
  </div>
</template>

<script lang="ts" setup>
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import Toc from '@/components/toc.vue';
dayjs.locale('fr'); // TODO: move this to a global setup

import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import armasm from 'highlight.js/lib/languages/armasm';
import json from 'highlight.js/lib/languages/json';
import "highlight.js/styles/tokyo-night-dark.min.css";

definePageMeta({
  async validate({ params }) {
    return await queryContent('posts').where({
      slug: params.slug,
    }).findOne() !== null;
  },
});

const route = useRoute();
const post = await queryContent('posts').where({
  slug: route.params.slug as string,
}).findOne();

useSeoMeta({
  colorScheme: "#c084fc",
  title: post.title,
  description: post.description,

  creator: 'szeroki',
  author: 'szeroki',
  articleAuthor: ["szeroki"],
  articlePublishedTime: post.pubDate,
  articleModifiedTime: post.pubDate,
  articleTag: post.tags,

  // Open Graph
  ogTitle: post.title,
  ogImage: post.image,
  ogImageAlt: post.title,
  ogDescription: post.description,
  ogType: 'article',
  ogUrl: `https://blog.szeroki.fr/posts/${post.slug}`,

  // Twitter
  twitterTitle: post.title,
  twitterImage: post.image,
  twitterImageAlt: post.title,
  twitterDescription: post.description,
  twitterCard: 'summary_large_image',
});

useJsonld(() => ({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: post.title,
  description: post.description,
  author: {
    '@type': 'Person',
    name: 'szeroki',
  },
  publisher: {
    '@type': 'Organization',
    name: 'szeroki',
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': `https://blog.szeroki.fr/posts/${post.slug}`,
  },
  image: {
    '@type': 'ImageObject',
    url: `https://blog.szeroki.fr${post.image}`,
  },
  datePublished: post.pubDate,
  dateModified: post.pubDate,
  wordCount: post.wordCount,
  articleSection: post.tags.join(', '),
  inLanguage: 'fr-FR',
  keywords: post.tags.join(', '),
  potentialAction: {
    '@type': 'ReadAction',
    target: `https://blog.szeroki.fr/posts/${post.slug}`,
  },
}));

onMounted(() => {
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('cpp', cpp);
  hljs.registerLanguage('c', c);
  hljs.registerLanguage('asm', armasm);

  hljs.highlightAll();
});
</script>