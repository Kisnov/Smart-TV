// $L reaches for ilib, which a plain unit test has no way to load. Every key is its
// own English source string, so handing the string straight back is faithful enough.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});
// The buttons are only read here, never drawn, so a plain div stands in for the spottable one.
jest.mock('./detailsSpottables', () => ({SpottableDiv: 'div'}));

import {detailActionCatalogue} from './detailActions';

// Only the item, as Spotlight, Nouveau and Minimalist pass it: none of them hands over the
// watched or favourite state on its own.
const button = (id, userData) => {
	const entry = detailActionCatalogue({item: {Id: 'show', Type: 'Series', UserData: userData}, seerr: {}})
		.find((action) => action.id === id);
	return entry.render().props;
};

describe('the detail action catalogue', () => {
	test('offers to mark an unwatched title as watched', () => {
		expect(button('watched', {Played: false})).toMatchObject({label: 'Mark as Watched', active: false});
	});

	test('shows a watched title as watched, read off the item', () => {
		expect(button('watched', {Played: true})).toMatchObject({label: 'Watched', active: true});
	});

	test('shows a favourite as favourited, read off the item', () => {
		expect(button('favorite', {IsFavorite: false})).toMatchObject({label: 'Favorite', active: false});
		expect(button('favorite', {IsFavorite: true})).toMatchObject({label: 'Favorited', active: true});
	});

	test('treats an item with no user data as neither', () => {
		expect(button('watched', undefined)).toMatchObject({label: 'Mark as Watched', active: false});
		expect(button('favorite', undefined)).toMatchObject({label: 'Favorite', active: false});
	});
});
