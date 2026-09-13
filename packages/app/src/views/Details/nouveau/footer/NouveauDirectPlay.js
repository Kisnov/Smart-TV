import {useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

import {SpottableDiv} from '../../detailsSpottables';
import {fetchDetailPlaybackInfo} from '../../detailPlaybackInfo';

import css from './NouveauDetailsFooter.module.less';

// Whether the server would hand this file over as it is, or rework it on the way. The answer is
// worth waiting for rather than guessing, so the line says it is still asking rather than showing
// nothing, and offers a way to ask again when the request falls over.
const NouveauDirectPlay = ({api, itemId, serverType, mediaSourceId, audioStreamIndex, subtitleStreamIndex}) => {
	const [state, setState] = useState({status: 'loading', result: null});
	const [attempt, setAttempt] = useState(0);

	const retry = useCallback(() => {
		setState({status: 'loading', result: null});
		setAttempt((n) => n + 1);
	}, []);

	useEffect(() => {
		let cancelled = false;
		setState({status: 'loading', result: null});

		fetchDetailPlaybackInfo(api, {
			itemId, serverType, mediaSourceId, audioStreamIndex, subtitleStreamIndex
		})
			.then((result) => {
				if (cancelled) return;
				setState(result
					? {status: 'ready', result}
					// Nothing came back to report on, so there is nothing honest to say.
					: {status: 'empty', result: null});
			})
			.catch(() => {
				if (!cancelled) setState({status: 'failed', result: null});
			});

		return () => {
			cancelled = true;
		};
	}, [api, itemId, serverType, mediaSourceId, audioStreamIndex, subtitleStreamIndex, attempt]);

	if (state.status === 'empty') return null;

	if (state.status === 'loading') {
		return <div className={css.capabilityPending}>{$L('Checking Direct Play capability...')}</div>;
	}

	// A blank line reads as still loading and gives the remote nothing to select, so the failure
	// says so and carries the way to try again.
	if (state.status === 'failed') {
		return (
			<div className={css.capabilityRow}>
				<span className={css.capabilityPending}>{$L('Failed to load')}</span>
				<SpottableDiv className={css.capabilityRetry} onClick={retry}>{$L('Retry')}</SpottableDiv>
			</div>
		);
	}

	const direct = state.result.supportsDirectPlay;

	return (
		<div className={css.capabilityRow}>
			<span className={`${css.capabilityDot} ${direct ? css.capabilityYes : css.capabilityNo}`} />
			<span className={css.capabilityLabel}>{$L('Direct Play')}</span>
		</div>
	);
};

export default NouveauDirectPlay;
