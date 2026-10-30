import {act, renderHook, waitFor} from '@testing-library/react';

import useFavoriteTabs from './useFavoriteTabs';

jest.mock('../../services/connectionPool', () => ({getFavoritesFromAllServers: jest.fn()}));
jest.mock('../../services/parentalControls', () => ({withoutBlockedItems: (items) => items}));

const tabsFor = (getItems) => renderHook(() => useFavoriteTabs({
	api: {getItems}, sortBy: 'SortName', sortOrder: 'Ascending', unifiedMode: false
}));

describe('useFavoriteTabs', () => {
	test('says the load failed only when every tab failed, and Retry asks again', async () => {
		const getItems = jest.fn(() => Promise.reject(new Error('offline')));
		const {result} = tabsFor(getItems);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.loadFailed).toBe(true);

		getItems.mockImplementation(() => Promise.resolve({Items: [], TotalRecordCount: 0}));
		const callsBefore = getItems.mock.calls.length;
		act(() => result.current.retry());
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(getItems.mock.calls.length).toBeGreaterThan(callsBefore);
		expect(result.current.loadFailed).toBe(false);
	});

	test('one type failing still counts as loaded', async () => {
		let call = 0;
		const getItems = jest.fn(() => (call++ === 0 ? Promise.reject(new Error('one')) : Promise.resolve({Items: [], TotalRecordCount: 0})));
		const {result} = tabsFor(getItems);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.loadFailed).toBe(false);
	});
});
