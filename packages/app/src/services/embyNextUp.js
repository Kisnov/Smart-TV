// How many recently played series the sweep asks about, and how many of those it has in flight at
// once so a small server isn't hit with the lot in one go.
const SERIES_SWEEP_LIMIT = 25;
const SWEEP_CONCURRENCY = 5;

// Emby 4.10 answers an unscoped Next Up with an empty list however much history the user has,
// while the same query scoped to a series returns the right episode. So an empty answer is followed
// by one question per recently played series, newest play first, which gives the row what the
// server would have if the wide query worked.
//
// `send` resolves an endpoint to its JSON, `itemsRoute` is the user's items route with its query
// string open, and `seriesNextUpUrl` builds the same Next Up query scoped to one series.
export const withEmbyNextUpSweep = async (send, answer, {itemsRoute, seriesNextUpUrl, limit}) => {
	if (answer?.Items?.length) return answer;
	try {
		const played = await send(`${itemsRoute}IncludeItemTypes=Episode&Filters=IsPlayed&Recursive=true&SortBy=DatePlayed&SortOrder=Descending&Limit=100&Fields=SeriesId`);

		// Kept in the order they were found, so newest play stays first without the repeats a
		// binged series leaves.
		const seriesIds = [];
		const playedItems = played?.Items || [];
		for (let i = 0; i < playedItems.length && seriesIds.length < SERIES_SWEEP_LIMIT; i++) {
			const id = playedItems[i]?.SeriesId ? String(playedItems[i].SeriesId) : '';
			if (id && seriesIds.indexOf(id) === -1) seriesIds.push(id);
		}
		if (!seriesIds.length) return answer;

		const episodes = [];
		for (let i = 0; i < seriesIds.length; i += SWEEP_CONCURRENCY) {
			const batch = await Promise.all(seriesIds.slice(i, i + SWEEP_CONCURRENCY).map((id) =>
				send(seriesNextUpUrl(id)).then((data) => (data?.Items || [])[0] || null)
			));
			batch.forEach((episode) => {
				if (episode) episodes.push(episode);
			});
		}

		return {...answer, Items: episodes.slice(0, limit), TotalRecordCount: episodes.length};
	} catch (err) {
		// The sweep is a best effort on top of an answer already in hand, so anything it throws
		// leaves that answer alone rather than failing the row.
		return answer;
	}
};
