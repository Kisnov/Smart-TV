import {fireEvent, render, screen} from '@testing-library/react';

import {ChecklistDialog} from './BrowseViews';

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
jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true)}));
// The real field reaches for the settings and the TV keyboard, and a plain input is all this needs.
jest.mock('../../components/SpottableInput/SpottableInput', () => ({
	__esModule: true,
	default: ({spotlightId, ...props}) => require('react').createElement('input', props) // eslint-disable-line no-unused-vars
}));
// Containers and spottables become plain elements that carry their spotlight id.
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
});
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
});

const OPTIONS = [
	{value: 'c', label: 'Charlie'},
	{value: 'a', label: 'alpha'},
	{value: 'b', label: 'Bravo'},
	{value: 'd', label: 'Delta'}
];

const rowLabels = (container) => [...container.querySelectorAll('[data-spotlight-id^="chk-"]')]
	.map((node) => node.getAttribute('data-spotlight-id'))
	.filter((id) => /^chk-\d+$/.test(id))
	.map((id) => container.querySelector(`[data-spotlight-id="${id}"]`).textContent);

const byId = (container, id) => container.querySelector(`[data-spotlight-id="${id}"]`);
const press = (container, id) => fireEvent.click(byId(container, id));

describe('ChecklistDialog', () => {
	test('lists the ticked rows first, sorted by label when asked, and keeps that order', () => {
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={['d', 'b']} sortByLabel onSave={() => {}} onCancel={() => {}} />
		);
		expect(rowLabels(container)).toEqual(['Bravo', 'Delta', 'alpha', 'Charlie']);
		press(container, 'chk-0');
		expect(rowLabels(container)).toEqual(['Bravo', 'Delta', 'alpha', 'Charlie']);
	});

	test('saves picks in the order they were made and keeps picks the list never showed until Clear', () => {
		const onSave = jest.fn();
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={['b', 'gone']} onSave={onSave} onCancel={() => {}} />
		);
		// Rows: Bravo, Charlie, alpha, Delta
		press(container, 'chk-3');
		press(container, 'chk-1');
		press(container, 'chk-save');
		expect(onSave).toHaveBeenLastCalledWith(['b', 'gone', 'd', 'c']);
		press(container, 'chk-clear');
		press(container, 'chk-save');
		expect(onSave).toHaveBeenLastCalledWith([]);
	});

	test('Select All adds the rest and Clear empties the list', () => {
		const onSave = jest.fn();
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={['b']} onSave={onSave} onCancel={() => {}} />
		);
		press(container, 'chk-select-all');
		press(container, 'chk-save');
		expect(onSave).toHaveBeenLastCalledWith(['b', 'c', 'a', 'd']);
		press(container, 'chk-clear');
		press(container, 'chk-save');
		expect(onSave).toHaveBeenLastCalledWith([]);
	});

	test('with a cap there is no Select All, and an unticked row ignores a tick once the cap is reached', () => {
		const onSave = jest.fn();
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={['a']} max={2} onSave={onSave} onCancel={() => {}} />
		);
		expect(byId(container, 'chk-select-all')).toBeNull();
		press(container, 'chk-1');
		press(container, 'chk-2');
		press(container, 'chk-save');
		expect(onSave).toHaveBeenCalledWith(['a', 'c']);
	});

	test('Cancel saves nothing', () => {
		const onSave = jest.fn();
		const onCancel = jest.fn();
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={[]} onSave={onSave} onCancel={onCancel} />
		);
		press(container, 'chk-0');
		press(container, 'chk-cancel');
		expect(onCancel).toHaveBeenCalled();
		expect(onSave).not.toHaveBeenCalled();
	});

	test('a long list mounts a screen of rows and grows as focus nears its end, while Select All reaches every row', () => {
		const onSave = jest.fn();
		const many = Array.from({length: 2000}, (_, i) => ({value: `s${i}`, label: `Studio ${String(i).padStart(4, '0')}`}));
		const {container} = render(
			<ChecklistDialog title='T' options={many} picked={[]} onSave={onSave} onCancel={() => {}} />
		);
		expect(rowLabels(container)).toHaveLength(10);
		fireEvent.focus(byId(container, 'chk-8'));
		expect(rowLabels(container)).toHaveLength(18);
		press(container, 'chk-select-all');
		press(container, 'chk-save');
		expect(onSave.mock.calls[0][0]).toHaveLength(2000);
	});

	test('a search narrows the list, and a pick made while searching stays after the search is cleared', () => {
		const onSave = jest.fn();
		const {container} = render(
			<ChecklistDialog title='T' options={OPTIONS} picked={[]} sortByLabel searchable onSave={onSave} onCancel={() => {}} />
		);
		const input = screen.getByPlaceholderText('Search');
		fireEvent.change(input, {target: {value: 'HA'}});
		expect(rowLabels(container)).toEqual(['alpha', 'Charlie']);
		press(container, 'chk-1');
		fireEvent.change(input, {target: {value: ''}});
		expect(rowLabels(container)).toEqual(['alpha', 'Bravo', 'Charlie', 'Delta']);
		press(container, 'chk-save');
		expect(onSave).toHaveBeenCalledWith(['c']);
	});
});
