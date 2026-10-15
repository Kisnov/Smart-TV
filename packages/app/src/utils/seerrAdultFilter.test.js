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
		getImageUrl: (path, size) => `https://image.tmdb.org/t/p/${size}${path}`
	}
}));

import seerrApi from '../services/seerrApi';
import {isSeerrAdult, withoutSeerrAdult} from './seerrAdultFilter';
import {fetchSeerrHomeRow} from './seerrHomeRows';

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

describe('withoutSeerrAdult', () => {
	it('drops adult titles only while the filter is on', () => {
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

	it('leave adult titles out', async () => {
		seerrApi.trending.mockResolvedValue(page(['Sex Tape', 'Toy Story', 'Up']));
		const row = await fetchSeerrHomeRow('trending', {blockAdult: true});
		expect(row.map((item) => item.Name)).toEqual(['Toy Story', 'Up']);
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
		const row = await fetchSeerrHomeRow('myRequests', {userId: 5, blockAdult: true});
		expect(row.map((item) => item.Name)).toEqual(['Toy Story']);
	});
});
