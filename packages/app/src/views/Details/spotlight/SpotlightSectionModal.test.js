import {render} from '@testing-library/react';

import SpotlightSectionModal from './SpotlightSectionModal';

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

// The decorator registers a container with the restrict its spotlightRestrict prop carries and
// drops one given in its config, so the stand-in shows the prop.
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({children, spotlightId, spotlightRestrict, ...props}) => React.createElement(type, {
		...props,
		'data-spotlight-id': spotlightId,
		'data-restrict': spotlightRestrict
	}, children);
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn()}));
jest.mock('@enact/sandstone/Scroller', () => ({
	Scroller: ({children}) => children
}));
jest.mock('./SpotlightGrids', () => () => null);
jest.mock('../detailsSpottables', () => ({
	SpottableDiv: ({children, ...props}) => require('react').createElement('div', props, children)
}));

describe('the Spotlight section modal', () => {
	test('holds focus inside through the prop the decorator honours', () => {
		render(
			<SpotlightSectionModal card={{id: 'seasons', title: 'Seasons', sections: []}} actions={{}} seerr={{}} />
		);
		const modal = document.querySelector('[data-spotlight-id="spotlight-modal"]');
		expect(modal.getAttribute('data-restrict')).toBe('self-only');
	});
});
