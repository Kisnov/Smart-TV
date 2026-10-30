import {renderHook, waitFor} from '@testing-library/react';

import useSeerrRows from './useSeerrRows';
import {fetchSeerrHomeRow} from '../../utils/seerrHomeRows';

jest.mock('../../utils/seerrHomeRows', () => ({
	getSeerrHomeRowConfigs: () => [{id: 'trending', title: 'Trending', cardType: 'portrait', type: 'media'}],
	fetchSeerrHomeRow: jest.fn(),
	normalizeMediaItem: (item) => item,
	SEERR_SECTION_TO_CONFIG: {seerrTrending: 'trending'}
}));
jest.mock('../../utils/seerrSliders', () => ({loadSliderHomeRow: jest.fn()}));

const homeRows = [{id: 'seerrTrending', enabled: true}];
const render = (blockAdult) => renderHook((props) => useSeerrRows(props), {
	initialProps: {seerrEnabled: true, seerrAuthenticated: true, seerrUserId: 1, homeRows, serverUrl: 'https://server', blockAdult}
});

describe('useSeerrRows', () => {
	test('takes rows loaded without the NSFW filter down as soon as it goes on', async () => {
		fetchSeerrHomeRow.mockResolvedValue([{id: 1, title: 'Unfiltered'}]);
		const {result, rerender} = render(false);
		await waitFor(() => expect(result.current.rows).toHaveLength(1));

		fetchSeerrHomeRow.mockReturnValue(new Promise(() => {}));
		rerender({seerrEnabled: true, seerrAuthenticated: true, seerrUserId: 1, homeRows, serverUrl: 'https://server', blockAdult: true});
		expect(result.current.rows).toEqual([]);
	});

	test('keeps its rows on screen while they refresh with the filter unchanged', async () => {
		fetchSeerrHomeRow.mockResolvedValue([{id: 1, title: 'Filtered'}]);
		const {result, rerender} = render(true);
		await waitFor(() => expect(result.current.rows).toHaveLength(1));

		fetchSeerrHomeRow.mockReturnValue(new Promise(() => {}));
		rerender({seerrEnabled: true, seerrAuthenticated: true, seerrUserId: 2, homeRows, serverUrl: 'https://server', blockAdult: true});
		expect(result.current.rows).toHaveLength(1);
	});
});
