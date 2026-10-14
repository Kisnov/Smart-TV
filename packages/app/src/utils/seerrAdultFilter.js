// Seerr's "hide adult content". TMDB's own flag catches only what is listed as adult, so a title or
// overview that trips one of these words counts too. The list is Core's
// (SeerrDiscoverViewModel._nsfwKeywords), so a title hidden on one device is hidden on the other.
const NSFW_KEYWORDS = [
	'\\bsex\\b', 'sexual', '\\bporn\\b', 'erotic', '\\bnude\\b', 'nudity',
	'\\bxxx\\b', 'adult film', 'prostitute', 'stripper', '\\bescort\\b',
	'seduction', '\\baffair\\b', 'threesome', '\\borgy\\b', 'kinky',
	'fetish', '\\bbdsm\\b', 'dominatrix'
];

const NSFW_PATTERNS = NSFW_KEYWORDS.map((keyword) => new RegExp(keyword, 'i'));

// On unless switched off, as on Core.
export const blocksSeerrAdult = (settings) => settings?.seerrBlockNsfw !== false;

// A TMDB result as Seerr hands it over, or a request's media once it has been filled in.
export const isSeerrAdult = (item) => {
	if (!item) return false;
	if (item.adult === true) return true;
	const text = `${item.title || item.name || ''} ${item.overview || ''}`;
	return NSFW_PATTERNS.some((pattern) => pattern.test(text));
};

export const withoutSeerrAdult = (items, enabled, pick = (item) => item) => {
	if (!enabled || !Array.isArray(items)) return items;
	return items.filter((item) => !isSeerrAdult(pick(item)));
};
