import $L from '@enact/i18n/$L';

// A series arrives as one flat run of episodes, and the screen shows one season of it at a time, so
// the run is split here and the selector picks which part of it is on screen.

export const seasonLabel = (number) => (
	number === 0 ? $L('Specials') : $L('Season {number}').replace('{number}', number)
);

// Season zero is where a server puts specials, so an episode with no season of its own lands there
// rather than being invented into season one.
const seasonOf = (episode) => (episode?.ParentIndexNumber != null ? episode.ParentIndexNumber : 0);

export const groupEpisodesBySeason = (episodes = []) => {
	const groups = new Map();

	[...episodes]
		.sort((a, b) => (seasonOf(a) - seasonOf(b)) || ((a.IndexNumber || 0) - (b.IndexNumber || 0)))
		.forEach((episode) => {
			const season = seasonOf(episode);
			if (!groups.has(season)) groups.set(season, []);
			groups.get(season).push(episode);
		});

	return groups;
};

export const seasonOptions = (groups) => [...groups.keys()].map((number) => ({
	id: String(number),
	number,
	label: seasonLabel(number)
}));

// Whichever season the viewer last picked, unless the run no longer has it, which happens when the
// episodes arrive after the first paint or the title is swapped underneath.
export const effectiveSeason = (numbers = [], selected) => (
	numbers.includes(selected) ? selected : numbers[0]
);
