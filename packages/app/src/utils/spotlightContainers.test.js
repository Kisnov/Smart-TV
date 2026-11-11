import {render} from '@testing-library/react';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {getContainerConfig} from '@enact/spotlight/src/container';

import {ModalContainer, PanelContainer, selfOnly} from './spotlightContainers';

// The CLI ships a second copy of React, so the components' JSX, and the decorator's own, goes
// through the copy under test.
jest.mock('react/jsx-runtime', () => {
	const React = require('react');
	const jsx = (type, {children, ...props}, key) => {
		const config = key === undefined ? props : {...props, key};
		return children === undefined ? React.createElement(type, config) : React.createElement(type, config, children);
	};
	return {Fragment: React.Fragment, jsx, jsxs: jsx};
});
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

describe('selfOnly', () => {
	test('a restrict in the decorator config is dropped for the prop default', () => {
		const Container = SpotlightContainerDecorator({restrict: 'self-only'}, 'div');
		render(<Container spotlightId="config-only" />);

		expect(getContainerConfig('config-only').restrict).toBe('self-first');
	});

	test('registers the container as self-only', () => {
		const Container = selfOnly(SpotlightContainerDecorator({}, 'div'));
		render(<Container spotlightId="held" />);

		expect(getContainerConfig('held').restrict).toBe('self-only');
	});

	test('the shared modal and panel containers hold focus', () => {
		render(
			<>
				<ModalContainer spotlightId="shared-modal" />
				<PanelContainer spotlightId="shared-panel" />
			</>
		);

		expect(getContainerConfig('shared-modal').restrict).toBe('self-only');
		expect(getContainerConfig('shared-panel').restrict).toBe('self-only');
	});
});
