import {act, fireEvent, render, screen} from '@testing-library/react';

import SyncPlayDialog from './SyncPlayDialog';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
// Children written side by side arrive as an array, and are spread so React doesn't ask for keys.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('@enact/spotlight', () => ({__esModule: true, default: {focus: jest.fn(() => true)}}));
// Spotlight's own props would be unknown attributes on the plain elements these mocks render.
jest.mock('@enact/spotlight/Spottable', () => ({
	__esModule: true,
	default: (tag) => {
		const React = require('react');
		return ({spotlightId, ...props}) => React.createElement(tag, props); // eslint-disable-line no-unused-vars
	}
}));
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => ({
	__esModule: true,
	default: (config, tag) => {
		const React = require('react');
		return ({spotlightId, ...props}) => React.createElement(tag, props); // eslint-disable-line no-unused-vars
	}
}));
jest.mock('../SpottableInput/SpottableInput', () => ({__esModule: true, default: () => null}));
jest.mock('../TVKeyboard/keyboardBus', () => ({isTvKeyboardVisible: () => false}));
jest.mock('../ItemContextMenu/itemMenuActions', () => ({MENU_ICON_PATHS: {arrowUpward: 'M0 0', arrowDownward: 'M0 0'}}));

const mockGetItems = jest.fn();
jest.mock('../../services/jellyfinApi', () => ({
	api: {getItems: (...args) => mockGetItems(...args)}
}));

let mockSyncPlay;
jest.mock('../../context/SyncPlayContext', () => ({
	useSyncPlay: () => mockSyncPlay
}));

const QUEUE = [
	{PlaylistItemId: 'p1', ItemId: 'aaaaaaaa-0000-0000-0000-000000000001'},
	{PlaylistItemId: 'p2', ItemId: 'aaaaaaaa-0000-0000-0000-000000000002'},
	{PlaylistItemId: 'p3', ItemId: 'aaaaaaaa-0000-0000-0000-000000000003'}
];

const buildSyncPlay = (overrides = {}) => ({
	group: {GroupName: 'Movie night', State: 'Paused', Participants: ['Ana', 'Pau']},
	groups: [],
	isInGroup: true,
	createGroup: jest.fn(),
	joinGroup: jest.fn(),
	leaveGroup: jest.fn(),
	refreshGroups: jest.fn(),
	playQueue: {Playlist: QUEUE, PlayingItemIndex: 1, RepeatMode: 'RepeatNone', ShuffleMode: 'Sorted'},
	playQueueItem: {Id: 'aaaaaaaa000000000000000000000002', Name: 'Second'},
	setRepeatMode: jest.fn(),
	setShuffleMode: jest.fn(),
	ignoreWait: false,
	setIgnoreWait: jest.fn(),
	setPlaylistItem: jest.fn(),
	movePlaylistItem: jest.fn(),
	removeFromPlaylist: jest.fn(),
	...overrides
});

const renderDialog = async () => {
	const view = render(<SyncPlayDialog open onClose={jest.fn()} />);
	// Let the queue's name lookup settle.
	await act(() => Promise.resolve());
	return view;
};

const queueRows = () => Array.from(document.querySelectorAll('.queueRow'));
const rowButton = (row, label) => Array.from(row.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === label);

beforeEach(() => {
	mockSyncPlay = buildSyncPlay();
	mockGetItems.mockReset();
	// The server hands ids back dashless, so the names have to be matched whatever the spelling.
	mockGetItems.mockResolvedValue({Items: [
		{Id: 'aaaaaaaa000000000000000000000001', Name: 'First'},
		{Id: 'aaaaaaaa000000000000000000000002', Name: 'Second'},
		{Id: 'aaaaaaaa000000000000000000000003', Name: 'Third'}
	]});
});

describe('SyncPlayDialog group queue', () => {
	test('lists every queue entry by name, looked up in one request', async () => {
		await renderDialog();
		expect(mockGetItems).toHaveBeenCalledTimes(1);
		expect(mockGetItems.mock.calls[0][0].Ids).toBe(QUEUE.map((entry) => entry.ItemId).join(','));
		expect(screen.getByText('Group queue')).toBeTruthy();
		expect(queueRows().map((row) => row.querySelector('.queueTitle').textContent)).toEqual(['First', 'Second', 'Third']);
		expect(queueRows()[1].querySelector('.queueCurrent')).not.toBeNull();
	});

	test('OK on another entry plays it for the group, OK on the playing one does nothing', async () => {
		await renderDialog();
		fireEvent.click(rowButton(queueRows()[1], 'Second, Now Playing'));
		expect(mockSyncPlay.setPlaylistItem).not.toHaveBeenCalled();
		fireEvent.click(rowButton(queueRows()[2], 'Watch now: Third'));
		expect(mockSyncPlay.setPlaylistItem).toHaveBeenCalledWith('p3');
	});

	test('moves an entry up or down one place and has no arrow past either end', async () => {
		await renderDialog();
		const [first, middle, last] = queueRows();
		expect(rowButton(first, 'Move Up')).toBeUndefined();
		expect(rowButton(last, 'Move Down')).toBeUndefined();
		fireEvent.click(rowButton(middle, 'Move Up'));
		expect(mockSyncPlay.movePlaylistItem).toHaveBeenLastCalledWith('p2', 0);
		fireEvent.click(rowButton(middle, 'Move Down'));
		expect(mockSyncPlay.movePlaylistItem).toHaveBeenLastCalledWith('p2', 2);
	});

	test('removes just the one entry', async () => {
		await renderDialog();
		fireEvent.click(rowButton(queueRows()[0], 'Remove'));
		expect(mockSyncPlay.removeFromPlaylist).toHaveBeenCalledWith(['p1']);
	});

	test('a single item is not shown as a queue', async () => {
		mockSyncPlay = buildSyncPlay({playQueue: {Playlist: [QUEUE[0]], PlayingItemIndex: 0}});
		await renderDialog();
		expect(screen.queryByText('Group queue')).toBeNull();
		expect(mockGetItems).not.toHaveBeenCalled();
	});
});

describe('SyncPlayDialog ignore wait', () => {
	test('shows the current setting and flips it', async () => {
		const {unmount} = await renderDialog();
		fireEvent.click(screen.getByText('Ignore wait: Off'));
		expect(mockSyncPlay.setIgnoreWait).toHaveBeenCalledWith(true);
		unmount();

		mockSyncPlay = buildSyncPlay({ignoreWait: true});
		await renderDialog();
		fireEvent.click(screen.getByText('Ignore wait: On'));
		expect(mockSyncPlay.setIgnoreWait).toHaveBeenCalledWith(false);
	});

	test('is there before anything has been queued', async () => {
		mockSyncPlay = buildSyncPlay({playQueue: null, playQueueItem: null});
		await renderDialog();
		expect(screen.getByText('Ignore wait: Off')).toBeTruthy();
	});
});
