const ts = () => new Date().toISOString().slice(11, 19);

export const log = {
	verbose: false,
	info: (msg: string) => console.log(`${ts()} ${msg}`),
	warn: (msg: string) => console.warn(`${ts()} ⚠ ${msg}`),
	error: (msg: string) => console.error(`${ts()} ✖ ${msg}`),
	debug: (msg: string) => {
		if (log.verbose) console.log(`${ts()} · ${msg}`);
	},
};
