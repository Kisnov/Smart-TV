import {useEffect} from 'react';
import $L from '@enact/i18n/$L';
import Button from '@enact/sandstone/Button';
import Spotlight from '@enact/spotlight';

import {MATERIAL_ICON_PATHS} from '../Settings/materialIconMap';

import css from './Details.module.less';

const RETRY_ID = 'details-load-retry';

// Shown in place of the page when the item itself couldn't be fetched, so the screen
// doesn't sit on its skeleton for good. Retry takes focus so OK tries again.
const DetailLoadFailed = ({onRetry}) => {
	useEffect(() => {
		window.requestAnimationFrame(() => Spotlight.focus(RETRY_ID));
	}, []);

	return (
		<div className={css.page}>
			<div className={css.blocked}>
				<svg className={css.blockedIcon} viewBox='0 -960 960 960' fill='currentColor' aria-hidden='true' focusable='false'>
					<path d={MATERIAL_ICON_PATHS.warning} />
				</svg>
				<div className={css.blockedText}>{$L('Could not load this. Check your connection and try again.')}</div>
				<Button className={css.loadFailedRetry} spotlightId={RETRY_ID} size='small' onClick={onRetry}>{$L('Retry')}</Button>
			</div>
		</div>
	);
};

export default DetailLoadFailed;
