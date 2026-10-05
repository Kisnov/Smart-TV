import {
	BURST_COUNTS,
	BURST_SECONDS,
	FALL_COUNTS,
	SPARKS_PER_BURST,
	buildSeasonalParticles
} from './seasonalParticles';

const seconds = (value) => parseFloat(value);

describe('buildSeasonalParticles', () => {
	test('density and the performance tier set how many particles fall', () => {
		for (const tier of ['low', 'mid', 'high']) {
			for (const effect of ['snow', 'leaves', 'confetti']) {
				for (const density of ['light', 'normal', 'heavy']) {
					const {falling, bursts} = buildSeasonalParticles(effect, density, 1, tier);
					expect(falling).toHaveLength(FALL_COUNTS[tier][density]);
					expect(bursts).toHaveLength(0);
				}
			}
		}
	});

	test('density sets how many fireworks are in the air', () => {
		for (const density of ['light', 'normal', 'heavy']) {
			const {falling, bursts} = buildSeasonalParticles('fireworks', density, 1, 'low');
			expect(falling).toHaveLength(0);
			expect(bursts).toHaveLength(BURST_COUNTS[density]);
			for (const burst of bursts) expect(burst.sparks).toHaveLength(SPARKS_PER_BURST);
		}
	});

	test('the same seed gives the same particles', () => {
		expect(buildSeasonalParticles('confetti', 'heavy', 42)).toEqual(buildSeasonalParticles('confetti', 'heavy', 42));
		expect(buildSeasonalParticles('confetti', 'heavy', 42)).not.toEqual(buildSeasonalParticles('confetti', 'heavy', 43));
	});

	test('every particle starts somewhere along its fall, so the screen starts full', () => {
		for (const effect of ['snow', 'leaves', 'confetti']) {
			for (const seed of [1, 2, 3]) {
				for (const {style, path} of buildSeasonalParticles(effect, 'heavy', seed).falling) {
					expect(path).toMatch(new RegExp(`^${effect}[0-5]$`));
					const left = parseFloat(style.left);
					expect(left).toBeGreaterThanOrEqual(0);
					expect(left).toBeLessThan(100);

					const duration = seconds(style.animationDuration);
					const delay = seconds(style.animationDelay);
					expect(delay).toBeLessThanOrEqual(0);
					expect(delay).toBeGreaterThan(-duration);
				}
			}
		}
	});

	test('writes the Webkit animation names that Chrome 38 needs', () => {
		const [particle] = buildSeasonalParticles('snow', 'light', 1).falling;
		expect(particle.style.WebkitAnimationDuration).toBe(particle.style.animationDuration);
		expect(particle.style.WebkitAnimationDelay).toBe(particle.style.animationDelay);

		const [burst] = buildSeasonalParticles('fireworks', 'light', 1).bursts;
		expect(burst.partStyle.WebkitAnimationDuration).toBe(`${BURST_SECONDS}s`);
		// The mover steps through five spots, one per burst, in step with it.
		expect(seconds(burst.moverStyle.animationDuration)).toBe(BURST_SECONDS * 5);
		expect(burst.moverStyle.animationDelay).toBe(burst.partStyle.animationDelay);
	});

	test('nearer snow is bigger, brighter, quicker and sways wider', () => {
		const dots = buildSeasonalParticles('snow', 'heavy', 5).falling
			.filter(p => p.shape === 'dot')
			.sort((a, b) => parseFloat(a.style.width) - parseFloat(b.style.width));
		const small = dots[0];
		const big = dots[dots.length - 1];
		expect(big.style.opacity).toBeGreaterThan(small.style.opacity);
		expect(seconds(big.style.animationDuration)).toBeLessThan(seconds(small.style.animationDuration));
		expect(Number(small.path.slice(-1)) % 2).toBe(0);
		expect(Number(big.path.slice(-1)) % 2).toBe(1);
	});

	test('sparks land on the ring, inside its box', () => {
		for (const spark of buildSeasonalParticles('fireworks', 'heavy', 9).bursts[0].sparks) {
			const x = parseFloat(spark.style.left) - 50;
			const y = parseFloat(spark.style.top) - 50;
			const radius = Math.sqrt(x * x + y * y);
			expect(radius).toBeGreaterThan(30);
			expect(radius).toBeLessThanOrEqual(50.01);
		}
	});

	test('draws nothing for none or an effect it does not know', () => {
		expect(buildSeasonalParticles('none', 'normal', 1)).toEqual({falling: [], bursts: []});
		expect(buildSeasonalParticles('aurora', 'normal', 1)).toEqual({falling: [], bursts: []});
	});
});
