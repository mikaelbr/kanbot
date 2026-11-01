// One page per built-in skill. Content comes from templates/.agents/skills.
import { loadSkills, skillPage } from "../../site/.vitepress/docs";

export default {
	paths: () =>
		loadSkills().map((skill) => ({
			params: { skill: skill.name },
			content: skillPage(skill, "https://github.com/mikaelbr/kanbot"),
		})),
};
