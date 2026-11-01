<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { data as releases } from "../releases.data";
</script>

<template>
	<p v-if="releases.length === 0">
		No releases found. See
		<a href="https://github.com/mikaelbr/kanbot/releases">GitHub releases</a>.
	</p>
	<section v-for="r in releases" :key="r.tag">
		<h2 :id="r.tag">
			<a :href="r.url">{{ r.tag }}</a>
			<small class="date">{{ r.date }}</small>
		</h2>
		<div v-html="r.html" />
	</section>
</template>

<style scoped>
.date {
	margin-left: 0.5rem;
	font-size: 0.875rem;
	font-weight: 400;
	color: var(--vp-c-text-2);
}
</style>
