// $L reaches for ilib, which a plain unit test has no way to load.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

// The real seerrApi reaches for platform storage on import. Only what the rows keep is under
// test here, so the request layer is stubbed out.
jest.mock('../services/seerrApi', () => ({
	__esModule: true,
	default: {
		trending: jest.fn(),
		trendingMovies: jest.fn(),
		getMyRequests: jest.fn(),
		getMovie: jest.fn(),
		getTv: jest.fn(),
		getCollection: jest.fn(),
		getImageUrl: (path, size) => `https://image.tmdb.org/t/p/${size}${path}`
	}
}));

import seerrApi from '../services/seerrApi';
import {blocksSeerrAdult, isSeerrAdult, withoutSeerrAdult} from './seerrAdultFilter';
import {fetchSeerrHomeRow} from './seerrHomeRows';
import {fetchMissingCollectionItems} from '../views/Details/seerrMissingCollectionItems';

describe('isSeerrAdult', () => {
	it('takes TMDB\'s adult flag', () => {
		expect(isSeerrAdult({id: 1, title: 'Quiet Film', adult: true})).toBe(true);
		expect(isSeerrAdult({id: 1, title: 'Quiet Film', adult: false})).toBe(false);
	});

	it('catches Core\'s words in the title, the series name or the overview, whatever the case', () => {
		expect(isSeerrAdult({title: 'Sex Education'})).toBe(true);
		expect(isSeerrAdult({name: 'The EROTIC Tales'})).toBe(true);
		expect(isSeerrAdult({title: 'Night Shift', overview: 'A stripper takes one last job.'})).toBe(true);
		expect(isSeerrAdult({title: 'A Threesome Story'})).toBe(true);
	});

	it('only matches the short words as whole words', () => {
		expect(isSeerrAdult({title: 'Sussex Gardens'})).toBe(false);
		expect(isSeerrAdult({title: 'The Escorted Convoy'})).toBe(false);
		expect(isSeerrAdult({title: 'Pornstar Martini Bar', overview: 'A cocktail bar.'})).toBe(false);
	});

	it('leaves everything else and anything missing alone', () => {
		expect(isSeerrAdult({title: 'Toy Story', overview: 'Toys come to life.'})).toBe(false);
		expect(isSeerrAdult({})).toBe(false);
		expect(isSeerrAdult(null)).toBe(false);
	});
});

describe('the NSFW Filter setting', () => {
	it('is on unless switched off, as on Core', () => {
		expect(blocksSeerrAdult({})).toBe(true);
		expect(blocksSeerrAdult(undefined)).toBe(true);
		expect(blocksSeerrAdult({seerrBlockNsfw: true})).toBe(true);
		expect(blocksSeerrAdult({seerrBlockNsfw: false})).toBe(false);
	});

	it('drops nothing while off', () => {
		const items = [{title: 'Sex Education'}, {title: 'Toy Story'}];
		expect(withoutSeerrAdult(items, false)).toBe(items);
		expect(withoutSeerrAdult(items, true).map((item) => item.title)).toEqual(['Toy Story']);
	});
});

describe('Seerr home rows', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	const page = (titles) => ({results: titles.map((title, i) => ({id: i + 1, mediaType: 'movie', title}))});

	it('leave adult titles out and still fill up to the row limit', async () => {
		seerrApi.trending.mockResolvedValue(page(['Sex Tape', ...Array.from({length: 22}, (_, i) => `Film ${i + 1}`)]));
		const row = await fetchSeerrHomeRow('trending');
		expect(row).toHaveLength(20);
		expect(row.map((item) => item.Name)).not.toContain('Sex Tape');
		expect(row[0].Name).toBe('Film 1');
	});

	it('keep them when the filter is off', async () => {
		seerrApi.trendingMovies.mockResolvedValue(page(['Sex Tape', 'Toy Story']));
		const row = await fetchSeerrHomeRow('popularMovies', {blockAdult: false});
		expect(row.map((item) => item.Name)).toEqual(['Sex Tape', 'Toy Story']);
	});

	it('judge a request by the media it asks for', async () => {
		seerrApi.getMyRequests.mockResolvedValue({results: [
			{id: 1, type: 'movie', media: {tmdbId: 11, mediaType: 'movie', title: 'Erotic Nights', posterPath: '/a.jpg'}},
			{id: 2, type: 'movie', media: {tmdbId: 12, mediaType: 'movie', title: 'Toy Story', posterPath: '/b.jpg'}}
		]});
		const row = await fetchSeerrHomeRow('myRequests', {userId: 5});
		expect(row.map((item) => item.Name)).toEqual(['Toy Story']);
	});
});

describe('missing collection items', () => {
	const boxSet = {Id: 'b1', ProviderIds: {Tmdb: '1000'}};
	const members = [
		{Id: 'm1', Name: 'Part One', Type: 'Movie', ProviderIds: {Tmdb: '1001'}},
		{Id: 'm2', Name: 'Part Two', Type: 'Movie', ProviderIds: {Tmdb: '1002'}}
	];

	beforeEach(() => {
		seerrApi.getCollection.mockResolvedValue({id: 1000, parts: [
			{id: 1001, title: 'Part One'},
			{id: 1002, title: 'Part Two'},
			{id: 1003, title: 'Part Three'},
			{id: 1004, title: 'Part Four', adult: true}
		]});
	});

	it('leave out a part TMDB lists as adult', async () => {
		const missing = await fetchMissingCollectionItems({boxSet, members, settings: {}});
		expect(missing.map((item) => item.Name)).toEqual(['Part Three']);
	});

	it('include it with the filter off', async () => {
		const missing = await fetchMissingCollectionItems({boxSet, members, settings: {seerrBlockNsfw: false}});
		expect(missing.map((item) => item.Name)).toEqual(['Part Three', 'Part Four']);
	});
});
