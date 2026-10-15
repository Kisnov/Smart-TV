import {useEffect} from 'react';
import $L from '@enact/i18n/$L';
import Button from '@enact/sandstone/Button';
import Spotlight from '@enact/spotlight';

import css from './LoadFailedNotice.module.less';

// Stands in for what couldn't be fetched, so a failed request doesn't read as there being nothing
// there. Retry takes focus unless a panel over the screen holds it.
const LoadFailedNotice = ({spotlightId, onRetry, autoFocus = true}) => {
	useEffect(() => {
		if (!autoFocus) return undefined;
		const frame = window.requestAnimationFrame(() => Spotlight.focus(spotlightId));
		return () => window.cancelAnimationFrame(frame);
	}, [spotlightId, autoFocus]);

	return (
		<div className={css.notice}>
			<div className={css.message}>{$L('Could not load this. Check your connection and try again.')}</div>
			<Button spotlightId={spotlightId} size='small' onClick={onRetry}>{$L('Retry')}</Button>
		</div>
	);
};

export default LoadFailedNotice;
