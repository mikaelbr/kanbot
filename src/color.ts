// ANSI colors for TTY output. Off when piped or NO_COLOR is set; FORCE_COLOR turns them on.
const on =
	!process.env.NO_COLOR &&
	(!!process.env.FORCE_COLOR || !!process.stdout.isTTY);

const wrap = (open: number, close: number) => (s: string) =>
	on ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const color = {
	bold: wrap(1, 22),
	dim: wrap(2, 22),
	red: wrap(31, 39),
	green: wrap(32, 39),
	yellow: wrap(33, 39),
	cyan: wrap(36, 39),
};
