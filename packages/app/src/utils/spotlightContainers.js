import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

// The decorator registers a container with its spotlightRestrict prop, 'self-first' unless given,
// and drops a restrict set in its config. A container that must hold focus is wrapped here, which
// also keeps a pointer resting on the sidebar from making that the active container the next
// arrow press lands in.
export const selfOnly = (Container) => {
	const SelfOnlyContainer = (props) => <Container spotlightRestrict="self-only" {...props} />;
	return SelfOnlyContainer;
};

// The track pickers the detail screen and the player both raise. A press at the edge stays
// on the picker. Explicit Spotlight.focus still crosses it, which is how these open and hand
// focus back on close.
export const ModalContainer = selfOnly(SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-selected="true"]',
	leaveFor: {left: '', right: '', up: '', down: ''},
	preserveId: true
}, 'div'));

// The sort and settings panels over the library, favorites and genre grids. Held the
// same way, but coming back in lands wherever the viewer left off.
export const PanelContainer = selfOnly(SpotlightContainerDecorator({
	enterTo: 'last-focused',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div'));

// Full screen layers like the trailer and the lost connection notice. Nothing under them
// can be seen, so a press at the edge stays on the layer.
export const OverlayContainer = SpotlightContainerDecorator({
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

// A strip of tabs where the one that is open is the one the remote lands on, however far along the
// strip it sits, rather than whichever tab happens to be nearest.
export const ActiveTabContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-active-tab="true"]',
	preserveId: true
}, 'div');

