import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {selfOnly} from '../../utils/spotlightContainers';

import css from './ChangeArtworkModal.module.less';

export const ModalContainer = selfOnly(SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: [`.${css.cardWrapper}`, '[data-spotlight-id="dialog-close-btn"]'],
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div'));

// Used by every overlay panel, which has to hold focus until it's dismissed.
export const RestrictedContainer = selfOnly(SpotlightContainerDecorator({
	enterTo: 'default-element',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div'));

export const SpottableDiv = Spottable('div');
export const SpottableButton = Spottable('button');
