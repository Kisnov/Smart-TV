import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import * as gamesApi from '../../services/gamesApi';
import {loadGameStateWithMigration} from '../../utils/gameSaves';
import GameDetails from './GameDetails';

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
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true)}));
jest.mock('@enact/sandstone/Button', () => {
	const React = require('react');
	return ({disabled, onClick, children}) => React.createElement('button', {disabled, onClick}, children);
});
jest.mock('../../components/AdminMessageDialog', () => () => null);
jest.mock('../../components/GameCard', () => () => null);
jest.mock('../../components/LoadingSpinner', () => () => null);
jest.mock('../../services/gamesApi', () => ({getGame: jest.fn(), getGames: jest.fn(), gameThumbUrl: () => null}));
jest.mock('../../utils/gameSaves', () => ({loadGameStateWithMigration: jest.fn()}));
jest.mock('../../utils/emulatorjs', () => ({isSupported: () => true, unsupportedMessage: () => ''}));

const library = {Id: 'lib'};
const game = {id: 'g1', core: 'nes', title: 'Game', system: 'NES'};
const onPlay = jest.fn();

const renderDetails = () => render(<GameDetails library={library} gameId="g1" initialGame={game} onPlay={onPlay} />);
const labels = () => screen.getAllByRole('button').map((b) => b.textContent);

beforeEach(() => {
	jest.clearAllMocks();
	gamesApi.getGame.mockResolvedValue(game);
	gamesApi.getGames.mockResolvedValue([]);
});

test('holds Play while the save check is running', async () => {
	let finish;
	loadGameStateWithMigration.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

	renderDetails();
	await waitFor(() => expect(loadGameStateWithMigration).toHaveBeenCalled());

	expect(labels()).toEqual(['Checking for save…']);
	expect(screen.getByRole('button').disabled).toBe(true);

	await act(async () => finish(null));

	expect(labels()).toEqual(['Play']);
	fireEvent.click(screen.getByRole('button'));
	expect(onPlay).toHaveBeenCalledWith(library, game, {fresh: false});
});

test('offers Continue and Restart once a save is found', async () => {
	loadGameStateWithMigration.mockResolvedValue(new Uint8Array([1]));

	renderDetails();
	fireEvent.click(await screen.findByText('Restart'));

	expect(labels()).toEqual(['Continue', 'Restart']);
	expect(onPlay).toHaveBeenCalledWith(library, game, {fresh: true});
});

test('a failed save check blocks play until a retry gets an answer', async () => {
	loadGameStateWithMigration
		.mockRejectedValueOnce(Object.assign(new Error('Save fetch error: 500'), {status: 500}))
		.mockResolvedValueOnce(new Uint8Array([1]));

	renderDetails();
	fireEvent.click(await screen.findByText('Retry save check'));
	await screen.findByText('Continue');

	expect(onPlay).not.toHaveBeenCalled();
	expect(loadGameStateWithMigration).toHaveBeenCalledTimes(2);
	expect(labels()).toEqual(['Continue', 'Restart']);
});

test('checks the save from the summary when the detail request fails', async () => {
	gamesApi.getGame.mockRejectedValue(new Error('offline'));
	loadGameStateWithMigration.mockResolvedValue(null);

	renderDetails();
	await screen.findByText('Play');

	expect(loadGameStateWithMigration).toHaveBeenCalledWith('g1', 'nes');
});
