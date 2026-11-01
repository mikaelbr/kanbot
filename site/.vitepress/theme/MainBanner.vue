<script setup lang="ts">
import { useData } from "vitepress";

// biome-ignore lint/correctness/noUnusedVariables: used in the template
const { theme } = useData();
</script>

<template>
	<div v-if="theme.channel === 'main'" class="main-banner">
		Unreleased docs for <code>main</code> ·
		<!-- target makes the router do a full page load into the other site. -->
		<a :href="theme.releaseUrl" target="_self">Latest release →</a>
	</div>
</template>

<style scoped>
.main-banner {
	position: fixed;
	top: 0;
	right: 0;
	left: 0;
	z-index: var(--vp-z-index-layout-top);
	height: var(--vp-layout-top-height);
	padding: 0 16px;
	overflow: hidden;
	font-size: 13px;
	line-height: var(--vp-layout-top-height);
	text-align: center;
	text-overflow: ellipsis;
	white-space: nowrap;
	/* The soft tint is translucent; layer it on the page colour so content doesn't show through. */
	background:
		linear-gradient(var(--vp-c-warning-soft), var(--vp-c-warning-soft)),
		var(--vp-c-bg);
	color: var(--vp-c-text-1);
}
.main-banner a {
	font-weight: 500;
	color: var(--vp-c-brand-1);
}
</style>
