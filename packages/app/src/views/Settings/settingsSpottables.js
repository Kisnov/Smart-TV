import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {selfOnly} from '../../utils/spotlightContainers';

export const SpottableDiv = Spottable('div');
export const SpottableButton = Spottable('button');

// Every screen holds focus on its own, so a 5-way press at the edge stays put rather than
// jumping to whatever the panel is sitting on top of.
export const ViewContainer = selfOnly(SpotlightContainerDecorator({
	enterTo: 'last-focused',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div'));
