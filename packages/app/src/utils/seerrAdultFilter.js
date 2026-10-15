// TMDB's adult flag misses a lot, so Core's keyword list counts too
// (SeerrDiscoverViewModel._nsfwKeywords). Keep the two in step.
const NSFW_PATTERN = new RegExp([
	'\\bsex\\b', 'sexual', '\\bporn\\b', 'erotic', '\\bnude\\b', 'nudity',
	'\\bxxx\\b', 'adult film', 'prostitute', 'stripper', '\\bescort\\b',
	'seduction', '\\baffair\\b', 'threesome', '\\borgy\\b', 'kinky',
	'fetish', '\\bbdsm\\b', 'dominatrix'
].join('|'), 'i');

// A TMDB result as Seerr hands it over, or a request's media once it has been filled in.
export const isSeerrAdult = (item) => {
	if (!item) return false;
	if (item.adult === true) return true;
	return NSFW_PATTERN.test(`${item.title || item.name || ''} ${item.overview || ''}`);
};

export const withoutSeerrAdult = (items, enabled, pick = (item) => item) => {
	if (!enabled || !Array.isArray(items)) return items;
	return items.filter((item) => !isSeerrAdult(pick(item)));
};
