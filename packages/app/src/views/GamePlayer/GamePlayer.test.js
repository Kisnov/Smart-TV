import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import Spotlight from '@enact/spotlight';
import * as gamesApi from '../../services/gamesApi';
import * as ejs from '../../utils/emulatorjs';
import {loadGameStateWithMigration} from '../../utils/gameSaves';
import GamePlayer from './GamePlayer';

jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {jsxDEV: (type, props, key, staticChildren) => {
		const config = key === undefined ? props : {...props, key};
		return staticChildren && Array.isArray(props.children)
			? React.createElement(type, config, ...props.children)
			: React.createElement(type, config);
	}};
});
jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true), pause: jest.fn(), resume: jest.fn()}));
jest.mock('@enact/spotlight/Spottable', () => () => {
	const React = require('react');
	return ({onClick, className, children}) => React.createElement('div', {onClick, className}, children);
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => () => {
	const React = require('react');
	return ({className, children}) => React.createElement('div', {className}, children);
});
jest.mock('../../components/AdminMessageDialog', () => () => null);
jest.mock('../../components/LoadingSpinner', () => () => null);
jest.mock('../../services/serverLogger', () => ({error: jest.fn(), LOG_CATEGORIES: {APP: 'app'}}));
jest.mock('../../services/video', () => ({
	initVideo: () => Promise.resolve(),
	keepScreenOn: jest.fn(),
	setupVisibilityHandler: () => () => {}
}));
jest.mock('../../services/gamesApi', () => ({
	getRomUrl: jest.fn(),
	getSettingsBlob: jest.fn(),
	getBiosBlobUrl: jest.fn(),
	putStateBytes: jest.fn(),
	putSettingsBlob: jest.fn()
}));
jest.mock('../../utils/gameSaves', () => ({
	gameStateKey: (id, core) => `ejs-${core}-${id}`,
	loadGameStateWithMigration: jest.fn()
}));
jest.mock('../../utils/emulatorjs', () => ({
	isSupported: () => true,
	unsupportedMessage: () => '',
	startEmulator: jest.fn(),
	destroyEmulator: jest.fn(),
	getState: jest.fn(),
	loadState: jest.fn(),
	restart: jest.fn(),
	setPaused: jest.fn(),
	toggleFastForward: jest.fn(),
	getSettingsJson: () => null,
	getOptions: () => [],
	setOption: jest.fn()
}));

const game = {id: 'g1', core: 'nes', title: 'Game', fileName: 'game.nes'};
const onBack = jest.fn();
const backHandler = {current: null};

// Spotlight pauses once the game is ready, so that is the signal a running game has come up.
const openMenu = async ({started = true} = {}) => {
	render(<GamePlayer library={{Id: 'lib'}} game={game} startFresh={false} onBack={onBack} backHandlerRef={backHandler} />);
	await waitFor(() => expect(started ? Spotlight.pause : ejs.startEmulator).toHaveBeenCalled());
	act(() => { backHandler.current(); });
};
const rows = () => screen.getAllByText(/^(Resume|Back|Save state|Save & exit|Load state|Exit)$/).map((r) => r.textContent);

beforeEach(() => {
	jest.clearAllMocks();
	gamesApi.getRomUrl.mockResolvedValue({url: 'rom', isBlob: false});
	gamesApi.getSettingsBlob.mockResolvedValue(null);
	gamesApi.putStateBytes.mockResolvedValue(undefined);
	loadGameStateWithMigration.mockResolvedValue(null);
	ejs.startEmulator.mockResolvedValue(undefined);
	ejs.getState.mockReturnValue(new Uint8Array([1]));
});

afterEach(() => jest.useRealTimers());

test('Exit asks first, with Back on top', async () => {
	await openMenu();

	fireEvent.click(screen.getByText('Exit'));

	expect(rows()).toEqual(['Back', 'Save & exit', 'Exit']);
	expect(onBack).not.toHaveBeenCalled();
});

test('the back key leaves the confirmation for the pause menu', async () => {
	await openMenu();
	fireEvent.click(screen.getByText('Exit'));

	act(() => { backHandler.current(); });

	expect(rows()).toEqual(['Resume', 'Save state', 'Exit']);
});

test('Save & exit stays in the game when the save does not land', async () => {
	gamesApi.putStateBytes.mockRejectedValue(new Error('Save upload error: 500'));
	await openMenu();
	fireEvent.click(screen.getByText('Exit'));

	fireEvent.click(screen.getByText('Save & exit'));

	await screen.findByText('Could not save state. Still playing.');
	expect(onBack).not.toHaveBeenCalled();
	expect(rows()).toEqual(['Back', 'Save & exit', 'Exit']);
});

test('Save & exit leaves once the save lands, without saving twice', async () => {
	await openMenu();
	fireEvent.click(screen.getByText('Exit'));

	fireEvent.click(screen.getByText('Save & exit'));

	await waitFor(() => expect(onBack).toHaveBeenCalled());
	expect(gamesApi.putStateBytes).toHaveBeenCalledTimes(1);
});

test('Save state says so when the upload fails', async () => {
	gamesApi.putStateBytes.mockRejectedValue(new Error('Save upload error: 500'));
	await openMenu();

	fireEvent.click(screen.getByText('Save state'));

	await screen.findByText('Could not save state.');
});

test('Load state says so when the read fails', async () => {
	loadGameStateWithMigration
		.mockResolvedValueOnce(new Uint8Array([1]))
		.mockRejectedValueOnce(new Error('Save fetch error: 500'));
	await openMenu();

	fireEvent.click(screen.getByText('Load state'));

	await screen.findByText('Could not load state.');
});

test('a game that never started leaves without asking', async () => {
	ejs.startEmulator.mockReturnValue(new Promise(() => {}));
	ejs.getState.mockReturnValue(null);
	await openMenu({started: false});

	fireEvent.click(screen.getByText('Exit'));

	await waitFor(() => expect(onBack).toHaveBeenCalled());
	expect(gamesApi.putStateBytes).not.toHaveBeenCalled();
});

test('Exit leaves after three seconds when the save hangs', async () => {
	jest.useFakeTimers();
	gamesApi.putStateBytes.mockReturnValue(new Promise(() => {}));
	await openMenu();
	fireEvent.click(screen.getByText('Exit'));
	fireEvent.click(screen.getByText('Exit'));

	await act(async () => { jest.advanceTimersByTime(2900); });
	expect(onBack).not.toHaveBeenCalled();

	await act(async () => { jest.advanceTimersByTime(100); });
	expect(onBack).toHaveBeenCalled();
});

test('Exit syncs the emulator settings after the save', async () => {
	await openMenu();
	fireEvent.click(screen.getByText('Exit'));
	fireEvent.click(screen.getByText('Exit'));

	await waitFor(() => expect(onBack).toHaveBeenCalled());
	expect(gamesApi.putStateBytes.mock.invocationCallOrder[0])
		.toBeLessThan(gamesApi.putSettingsBlob.mock.invocationCallOrder[0]);
});
