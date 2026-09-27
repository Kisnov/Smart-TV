import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import Spotlight from '@enact/spotlight';
import * as gamesApi from '../../services/gamesApi';
import * as ejs from '../../utils/emulatorjs';
import {loadGameStateWithMigration} from '../../utils/gameSaves';
import GamePlayer from './GamePlayer';

jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {Fragment: React.Fragment, jsxDEV: (type, props, key, staticChildren) => {
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
	const directions = {ArrowLeft: 'onSpotlightLeft', ArrowRight: 'onSpotlightRight', ArrowUp: 'onSpotlightUp', ArrowDown: 'onSpotlightDown'};
	return ({onClick, className, children, spotlightId, ...rest}) => React.createElement('div', {
		onClick,
		className,
		'aria-label': rest['aria-label'],
		'data-spotlight-id': spotlightId,
		onKeyDown: (ev) => { if (rest[directions[ev.key]]) rest[directions[ev.key]](ev); }
	}, children);
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
	getOptions: jest.fn(),
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
	ejs.getOptions.mockReturnValue([]);
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

const shader = {
	id: 'shader',
	label: 'Shader',
	choices: [{value: 'disabled', label: 'disabled'}, {value: 'crt', label: 'crt'}, {value: 'sabr', label: 'sabr'}],
	current: 'disabled'
};
const fps = {id: 'fps', label: 'FPS counter', choices: [{value: 'show', label: 'show'}, {value: 'hide', label: 'hide'}], current: 'hide'};

const openSettings = async () => {
	ejs.getOptions.mockReturnValue([shader, fps]);
	await openMenu();
	fireEvent.click(screen.getByText('Emulator settings'));
};
const rowOf = (text) => screen.getByText(text).closest('[data-spotlight-id]');

test('left and right step a setting and stop at either end', async () => {
	await openSettings();

	fireEvent.keyDown(rowOf('Shader'), {key: 'ArrowLeft'});
	expect(ejs.setOption).not.toHaveBeenCalled();

	fireEvent.keyDown(rowOf('Shader'), {key: 'ArrowRight'});
	fireEvent.keyDown(rowOf('Shader'), {key: 'ArrowRight'});
	fireEvent.keyDown(rowOf('Shader'), {key: 'ArrowRight'});

	expect(ejs.setOption.mock.calls).toEqual([['shader', 'crt'], ['shader', 'sabr']]);
	expect(rowOf('Shader').textContent).toContain('sabr');
});

test('OK opens the values with a check on the current one, and picking one applies it', async () => {
	await openSettings();

	fireEvent.click(rowOf('Shader'));

	expect(rowOf('disabled').querySelector('svg')).not.toBeNull();
	expect(rowOf('crt').querySelector('svg')).toBeNull();
	await waitFor(() => expect(Spotlight.focus).toHaveBeenCalledWith('game-choice-0'));

	fireEvent.click(rowOf('crt'));

	expect(ejs.setOption).toHaveBeenCalledWith('shader', 'crt');
	expect(rowOf('Shader').textContent).toContain('crt');
	await waitFor(() => expect(Spotlight.focus).toHaveBeenCalledWith('game-setting-0'));
});

test('back leaves the picker unchanged, then the settings for the row that opened them', async () => {
	await openSettings();
	fireEvent.click(rowOf('FPS counter'));

	act(() => { backHandler.current(); });

	expect(ejs.setOption).not.toHaveBeenCalled();
	expect(rowOf('FPS counter').textContent).toContain('hide');
	await waitFor(() => expect(Spotlight.focus).toHaveBeenCalledWith('game-setting-1'));

	act(() => { backHandler.current(); });

	expect(screen.getByText('Resume')).toBeTruthy();
	await waitFor(() => expect(Spotlight.focus).toHaveBeenCalledWith('game-overlay-settings'));
});

test('the close button goes back to the pause menu', async () => {
	await openSettings();

	fireEvent.click(screen.getByLabelText('Close'));

	expect(screen.getByText('Resume')).toBeTruthy();
});

test('up and down wrap around the settings and the values', async () => {
	await openSettings();

	fireEvent.keyDown(rowOf('FPS counter'), {key: 'ArrowDown'});
	await waitFor(() => expect(Spotlight.focus).toHaveBeenCalledWith('game-settings-close'));

	fireEvent.keyDown(screen.getByLabelText('Close'), {key: 'ArrowUp'});
	await waitFor(() => expect(Spotlight.focus).toHaveBeenCalledWith('game-setting-1'));

	fireEvent.keyDown(screen.getByLabelText('Close'), {key: 'ArrowDown'});
	await waitFor(() => expect(Spotlight.focus).toHaveBeenLastCalledWith('game-setting-0'));

	fireEvent.click(rowOf('Shader'));
	fireEvent.keyDown(rowOf('disabled'), {key: 'ArrowUp'});
	await waitFor(() => expect(Spotlight.focus).toHaveBeenCalledWith('game-choice-2'));

	fireEvent.keyDown(rowOf('sabr'), {key: 'ArrowDown'});
	await waitFor(() => expect(Spotlight.focus).toHaveBeenLastCalledWith('game-choice-0'));
});
