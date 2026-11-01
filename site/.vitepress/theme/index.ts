import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import "@catppuccin/vitepress/theme/mocha/teal.css";
import MainBanner from "./MainBanner.vue";
import ReleaseList from "./ReleaseList.vue";
import "./custom.css";

export default {
	extends: DefaultTheme,
	Layout: () =>
		h(DefaultTheme.Layout, null, { "layout-top": () => h(MainBanner) }),
	enhanceApp({ app }) {
		app.component("ReleaseList", ReleaseList);
	},
} satisfies Theme;
