import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import "@catppuccin/vitepress/theme/mocha/teal.css";
import ReleaseList from "./ReleaseList.vue";
import "./custom.css";

export default {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component("ReleaseList", ReleaseList);
	},
} satisfies Theme;
