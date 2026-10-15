import {fireEvent, render, screen} from '@testing-library/react';
import Spotlight from '@enact/spotlight';

import LoadFailedNotice from './LoadFailedNotice';

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
	return ({onClick, children}) => React.createElement('button', {onClick}, children);
});

describe('LoadFailedNotice', () => {
	beforeEach(() => {
		Spotlight.focus.mockClear();
		jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => callback());
	});

	afterEach(() => {
		window.requestAnimationFrame.mockRestore();
	});

	test('says the list could not be loaded and puts focus on Retry', () => {
		render(<LoadFailedNotice spotlightId='list-retry' onRetry={() => {}} />);

		expect(screen.getByText('Could not load this. Check your connection and try again.')).toBeTruthy();
		expect(Spotlight.focus).toHaveBeenCalledWith('list-retry');
	});

	test('leaves focus alone while a panel holds it', () => {
		render(<LoadFailedNotice spotlightId='list-retry' onRetry={() => {}} autoFocus={false} />);

		expect(Spotlight.focus).not.toHaveBeenCalled();
	});

	test('retries when Retry is pressed', () => {
		const onRetry = jest.fn();
		render(<LoadFailedNotice spotlightId='list-retry' onRetry={onRetry} />);

		fireEvent.click(screen.getByText('Retry'));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
