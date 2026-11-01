<script setup lang="ts">
import { useData } from "vitepress";

// biome-ignore lint/correctness/noUnusedVariables: used in the template
const { theme } = useData();
</script>

<template>
	<div v-if="theme.channel === 'main'" class="main-banner">
		Docs for unreleased changes on <code>main</code>.
		<a :href="theme.releaseUrl">Docs for the latest release →</a>
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
	display: flex;
	gap: 8px;
	align-items: center;
	justify-content: center;
	padding: 0 16px;
	font-size: 14px;
	background: var(--vp-c-warning-soft);
	color: var(--vp-c-text-1);
}
.main-banner a {
	font-weight: 500;
	color: var(--vp-c-brand-1);
}
</style>
