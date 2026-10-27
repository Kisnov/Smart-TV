import {renderHook} from '@testing-library/react';

import {usePlayerButtons} from './PlayerControls';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
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
jest.mock('@enact/spotlight/Spottable', () => ({__esModule: true, default: (tag) => tag}));
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => ({__esModule: true, default: (config, tag) => tag}));
jest.mock('../../utils/spotlightContainers', () => ({ModalContainer: 'div'}));
// Only the button lists are under test, so the parts of the controls that draw things stay out.
jest.mock('@enact/sandstone/Scroller', () => () => null);
jest.mock('../../services/playback', () => ({}));
jest.mock('../../services/jellyfinApi', () => ({getServerUrl: () => 'http://server'}));
jest.mock('../../components/TrickplayPreview', () => () => null);
jest.mock('./SubtitleOffsetOverlay', () => () => null);
jest.mock('./SubtitleSettingsOverlay', () => () => null);
jest.mock('./SecondarySubtitleSettingsOverlay', () => () => null);
jest.mock('./EpisodeBrowser', () => () => null);
jest.mock('../../components/TrackOptionRow', () => ({__esModule: true, default: () => null, TrackDivider: () => null}));
jest.mock('../../platform', () => ({getPlatform: () => 'webos'}));
jest.mock('../../context/SettingsContext', () => ({useSettings: () => ({settings: {}})}));

const baseProps = {
	isPaused: false, audioStreams: [], subtitleStreams: [], chapters: [],
	nextEpisode: null, isAudioMode: false, isLiveTV: false, hasNextTrack: false, hasPrevTrack: false,
	shuffleMode: false, repeatMode: 'off', selectedQuality: null,
	selectedSubtitleIndex: -1, canDownloadRemoteSubtitles: false, hasCastMembers: false,
	zoomModeLabel: 'Fit', zoomModeKey: 'fit', sleepMinutes: null
};

const favoriteButton = (props) => {
	const {result} = renderHook(() => usePlayerButtons({...baseProps, ...props}));
	return result.current.bottomButtons.find((button) => button.id === 'favorite');
};

describe('the Favorite player button', () => {
	test('is there for an item that can be a favorite, and says what OK will do', () => {
		expect(favoriteButton({canFavorite: true})).toMatchObject({action: 'favorite', active: false, label: 'Add to Favorites'});
		expect(favoriteButton({canFavorite: true, isFavorite: true})).toMatchObject({active: true, label: 'Remove from Favorites'});
	});

	test('is not there for a preroll or an item without an id', () => {
		expect(favoriteButton({canFavorite: false})).toBeUndefined();
		expect(favoriteButton({})).toBeUndefined();
	});
});
