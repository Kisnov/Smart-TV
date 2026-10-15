import {act, renderHook} from '@testing-library/react';

import {SyncPlayProvider, useSyncPlay} from './SyncPlayContext';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		jsxDEV: (type, {children, ...props}, key) => {
			const config = key === undefined ? props : {...props, key};
			return children === undefined ? React.createElement(type, config) : React.createElement(type, config, children);
		}
	};
});

let mockEmit;
const mockSetIgnoreWait = jest.fn();
jest.mock('../services/syncPlay', () => ({
	start: () => {},
	stop: () => {},
	addListener: (listener) => {
		mockEmit = listener;
		return () => {};
	},
	setIgnoreWait: (...args) => mockSetIgnoreWait(...args)
}));
jest.mock('./AuthContext', () => ({useAuth: () => ({isAuthenticated: true, serverType: 'jellyfin'})}));
jest.mock('./SettingsContext', () => ({useSettings: () => ({settings: {}})}));
jest.mock('../services/jellyfinApi', () => ({api: {}}));

const renderSyncPlay = () => renderHook(() => useSyncPlay(), {wrapper: SyncPlayProvider});

beforeEach(() => {
	mockSetIgnoreWait.mockReset();
});

describe('Ignore wait', () => {
	test('turns on and off, and goes back when the server refuses it', async () => {
		const {result} = renderSyncPlay();
		mockSetIgnoreWait.mockResolvedValue(true);
		await act(() => result.current.toggleIgnoreWait());
		expect(mockSetIgnoreWait).toHaveBeenLastCalledWith(true);
		expect(result.current.ignoreWait).toBe(true);

		mockSetIgnoreWait.mockResolvedValue(false);
		await act(() => result.current.toggleIgnoreWait());
		expect(mockSetIgnoreWait).toHaveBeenLastCalledWith(false);
		expect(result.current.ignoreWait).toBe(true);
	});

	test('starts off again in the next group', async () => {
		const {result} = renderSyncPlay();
		mockSetIgnoreWait.mockResolvedValue(true);
		await act(() => result.current.toggleIgnoreWait());
		expect(result.current.ignoreWait).toBe(true);

		act(() => mockEmit('groupLeft'));
		expect(result.current.ignoreWait).toBe(false);

		await act(() => result.current.toggleIgnoreWait());
		act(() => mockEmit('groupJoined', {GroupId: 'g2'}));
		expect(result.current.ignoreWait).toBe(false);
	});
});
