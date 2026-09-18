// Kids Mode strips the app back to what a child needs and locks the way out behind a PIN.
//
// Everything the mode decides lives here, so the rules can be read in one place and tested
// without a screen. The flag itself is kept on this television rather than synced, since a parent
// handing over the TV should not put their phone in Kids Mode too.

export const isKidsMode = (settings) => settings?.kidsModeEnabled === true;

// Whether the way out needs a PIN at all. Nothing should be able to leave the mode on without
// one, but if anything ever did there would be no code to check and no way to recover on a
// television, so the door opens rather than locking for good.
export const kidsModeNeedsPin = (settings) => Boolean(settings?.kidsPinHash);

// The only rows the mode leaves standing: the way into the libraries, and what arrived in them
// lately. An allow list rather than a block list, so a row added later stays hidden until someone
// decides a child should see it. Everything else pulls from somewhere this mode cannot vouch for,
// whether that is a request queue, an outside catalogue no parental rating reaches, or the watch
// history of whoever used the account last.
const KIDS_MODE_ROWS = ['library-tiles', 'librarybuttons', 'latest-media'];

const LIBRARY_ROWS = ['library-tiles', 'librarybuttons'];

// Ahead of every saved row, which start at zero.
const LEADING_ORDER = -1;

// Applied on read rather than by rewriting the saved rows, so turning the mode off gives the user
// their own layout back untouched.
export const kidsModeRows = (rows, kidsMode) => {
	if (!kidsMode) return rows;

	const kept = (rows || []).filter((row) => KIDS_MODE_ROWS.indexOf(row.id) >= 0);

	// The mode drops the libraries entry from the navbar, so the library row is the only way into a
	// library and it leads, wherever the user had put it. Switched on in place rather than added
	// again, so the list never carries the same row twice.
	const existing = kept.find((row) => LIBRARY_ROWS.indexOf(row.id) >= 0);
	if (existing) {
		return kept.map((row) => (
			row === existing ? {...row, enabled: true, order: LEADING_ORDER} : row
		));
	}
	return [{id: 'library-tiles', name: 'My Media', enabled: true, order: LEADING_ORDER}, ...kept];
};

// Buttons the mode takes away. A non-admin account never sees the admin ones anyway, so those
// matter when the account handed over is a parent's own. The Seerr and SyncPlay buttons open
// their own dialogs rather than moving to a panel, which puts them out of reach of the panel
// guard and leaves this set as the only thing holding them back.
export const KIDS_MODE_HIDDEN_BUTTONS = [
	'admin',
	'artwork',
	'deleteFiles',
	'seerrRequest',
	'seerrRequest4k',
	'seerrWatchlist',
	'seerrReportIssue',
	'seerrManage',
	'watchWithGroup'
];

// Filtered before the user's own button arrangement is applied, so reordering cannot bring one of
// these back.
export const kidsModeButtons = (buttons, kidsMode) => {
	if (!kidsMode) return buttons;
	return (buttons || []).filter((button) => KIDS_MODE_HIDDEN_BUTTONS.indexOf(button.id) < 0);
};

// Panels the mode refuses to open.
const KIDS_MODE_BLOCKED_PANELS = [
	'LIVETV',
	'RECORDINGS',
	'SEERR_DISCOVER',
	'SEERR_REQUESTS',
	'SEERR_BROWSE',
	'SEERR_PERSON'
];

export const blockedPanels = (panels) =>
	KIDS_MODE_BLOCKED_PANELS.map((name) => panels[name]).filter((index) => index !== undefined);

// Hiding a nav entry is presentation. A home row, a search result or the back stack reaches these
// panels without one, so the move itself has to refuse.
export const allowedPanel = (panel, blocked, home) => (blocked.indexOf(panel) >= 0 ? home : panel);
