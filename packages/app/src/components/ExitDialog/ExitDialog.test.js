import {render} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import ExitDialog from './ExitDialog';

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

jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, children, ...props}) => React.createElement(type, props, children); // eslint-disable-line no-unused-vars
});
// The decorator registers a container with the restrict its spotlightRestrict prop carries and
// drops one given in its config, so the stand-in shows the prop.
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, spotlightRestrict, children, ...props}) => React.createElement(type, {...props, 'data-restrict': spotlightRestrict}, children); // eslint-disable-line no-unused-vars
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(), getCurrent: jest.fn()}));
jest.mock('../../utils/appLifecycle', () => ({exitApp: jest.fn()}));
jest.mock('../../platform', () => ({isVega: () => false, getPlatform: () => 'tizen'}));

describe('ExitDialog', () => {
	test('holds focus inside through the prop the decorator honours', () => {
		render(<ExitDialog open onCancel={() => {}} />);
		expect(document.querySelector('[data-restrict]').getAttribute('data-restrict')).toBe('self-only');
	});

	test('closing puts focus back on what held it before', () => {
		const card = document.createElement('div');
		document.body.appendChild(card);
		Spotlight.getCurrent.mockReturnValue(card);
		Spotlight.focus.mockReturnValue(true);
		const {rerender} = render(<ExitDialog open onCancel={() => {}} />);
		rerender(<ExitDialog open={false} onCancel={() => {}} />);
		expect(Spotlight.focus).toHaveBeenLastCalledWith(card);
		card.remove();
	});

	test('falls back to the nav when that element is gone', () => {
		Spotlight.getCurrent.mockReturnValue(document.createElement('div'));
		const {rerender} = render(<ExitDialog open onCancel={() => {}} />);
		rerender(<ExitDialog open={false} onCancel={() => {}} />);
		expect(Spotlight.focus).toHaveBeenLastCalledWith('navbar');
	});
});
