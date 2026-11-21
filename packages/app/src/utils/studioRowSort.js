// Jellyfin's /Studios takes no SortBy or SortOrder and always lists by name, so the Studios row
// picks its order from name pages: the first page for A to Z, the last for Z to A, and a page
// from a random point for Random. Any other sort would need every studio, so it reads as Name,
// the way the setting shows it.

export const STUDIO_PAGE_SIZE = 200;

export const studioRowSortBy = (stored) => (stored === 'Random' ? 'Random' : 'SortName');

const shuffled = (items) => {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
};

// The endpoint can't ask for particular studios, so picked ones are read a page at a time until all have turned up.
const readPicked = async (fetchPage, picked) => {
	const outstanding = new Set(picked);
	const found = [];
	for (let start = 0; outstanding.size > 0; start += STUDIO_PAGE_SIZE) {
		const items = (await fetchPage(start, STUDIO_PAGE_SIZE))?.Items || [];
		items.forEach((studio) => {
			if (outstanding.delete(studio.Id)) found.push(studio);
		});
		if (items.length < STUDIO_PAGE_SIZE) break;
	}
	return found;
};

// fetchPage(startIndex, limit) reads one page of studios in name order.
export const readStudioRow = async (fetchPage, {limit, sortBy, sortOrder, picked}) => {
	const random = sortBy === 'Random';
	const descending = !random && sortOrder === 'Descending';
	if (picked?.length > 0) {
		const found = await readPicked(fetchPage, picked);
		const Items = random ? shuffled(found) : (descending ? found.reverse() : found);
		return {Items, TotalRecordCount: Items.length};
	}
	const first = await fetchPage(0, random ? STUDIO_PAGE_SIZE : limit);
	if (!random && !descending) return first;
	const total = first?.TotalRecordCount || 0;
	if (descending) {
		const last = total > limit ? await fetchPage(total - limit, limit) : first;
		return {...last, Items: [...(last?.Items || [])].reverse()};
	}
	const lastStart = total - STUDIO_PAGE_SIZE;
	const page = lastStart > 0 ? await fetchPage(Math.floor(Math.random() * (lastStart + 1)), STUDIO_PAGE_SIZE) : first;
	return {...page, Items: shuffled(page?.Items || []).slice(0, limit)};
};
