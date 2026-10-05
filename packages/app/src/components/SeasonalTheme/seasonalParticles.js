// Builds the particles for one seasonal effect. Everything random is decided here, once,
// and handed to the browser as inline styles on CSS keyframe animations, so nothing runs
// per frame in JS. The build inlines CSS custom properties and old engines drop the ones
// JS sets, so per particle values have to travel as plain inline styles. Autoprefixer
// never sees inline styles, so the Webkit names are written out for Chrome 38.

// Each falling particle is one animated layer, and every layer adds to the compositor's
// work, so the counts follow the performance tier.
export const FALL_COUNTS = {
	low: {light: 8, normal: 14, heavy: 22},
	mid: {light: 12, normal: 22, heavy: 32},
	high: {light: 16, normal: 32, heavy: 48}
};
export const BURST_COUNTS = {light: 1, normal: 2, heavy: 3};
export const SPARKS_PER_BURST = 32;

// One firework from launch to the last spark fading. The movers step through their
// five spots over five of these.
export const BURST_SECONDS = 3.2;

const LEAF_COLORS = ['#d2691e', '#b5451b', '#e08a1e', '#c9a227', '#8b4513', '#a63d20', '#7a8b2a'];
const CONFETTI_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#d81b60', '#fb8c00', '#8e24aa', '#00acc1'];
const FIREWORK_COLORS = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb', '#ff6e40'];

// mulberry32, small and good enough to scatter particles.
const seededRandom = (seed) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const lerp = (a, b, t) => a + (b - a) * t;
const round = (value, places = 3) => Number(value.toFixed(places));
const pick = (list, random) => list[Math.floor(random() * list.length)];

// Old engines fade a gradient toward transparent black, so it fades to the same color at
// zero alpha instead.
const glow = (hex, alpha) => {
	const n = parseInt(hex.slice(1), 16);
	const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
	return `radial-gradient(circle closest-side, rgba(${rgb}, ${alpha}), rgba(${rgb}, 0))`;
};

const timing = (duration, delay) => ({
	animationDuration: `${duration}s`,
	WebkitAnimationDuration: `${duration}s`,
	animationDelay: `${delay}s`,
	WebkitAnimationDelay: `${delay}s`
});

// Seconds to fall the height of the screen, from the nearest particle to the farthest.
// These match Moonfin-Core's speeds.
const FALL_SECONDS = {
	snow: [12, 27],
	leaves: [18, 35],
	confetti: [9.5, 18]
};

const fallParticle = (effect, random, key) => {
	// Depth ties size, speed and opacity together, so far particles are small, slow and
	// faint and near ones the opposite.
	const depth = random();
	const [near, far] = FALL_SECONDS[effect];
	const fall = round(lerp(far, near, depth), 2);
	const shapeRoll = random();
	const drift = Math.floor(random() * 3);

	// For snow the odd variants sway wider, so nearer flakes take those.
	const odd = effect === 'snow' ? depth > 0.5 : random() < 0.5;
	const variant = drift * 2 + (odd ? 1 : 0);

	let shape;
	let size;
	let opacity;
	let color = null;
	if (effect === 'snow') {
		const crystal = depth > 0.55 && shapeRoll < 0.45;
		shape = crystal ? 'flake' : 'dot';
		size = crystal ? lerp(0.85, 1.6, depth) : lerp(0.4, 1.3, depth);
		opacity = lerp(0.35, 0.95, depth);
	} else if (effect === 'leaves') {
		shape = shapeRoll < 0.5 ? 'leaf' : 'leafMirror';
		size = lerp(1.3, 2.6, depth);
		opacity = lerp(0.7, 1, depth);
		color = pick(LEAF_COLORS, random);
	} else {
		shape = shapeRoll < 0.6 ? 'strip' : 'disc';
		size = lerp(0.65, 1.2, depth);
		opacity = lerp(0.85, 1, depth);
		color = pick(CONFETTI_COLORS, random);
	}

	return {
		key,
		shape,
		path: `${effect}${variant}`,
		style: {
			left: `${round(random() * 100, 2)}%`,
			width: `${round(size)}vh`,
			height: `${round(shape === 'strip' ? size * 0.55 : size)}vh`,
			opacity: round(opacity, 2),
			...(color ? {backgroundColor: color} : null),
			// A negative delay starts the particle part way down, so the screen starts full.
			...timing(fall, -round(random() * fall, 2))
		}
	};
};

const burst = (index, count, random) => {
	const delay = -round((index * BURST_SECONDS) / count + random() * 0.4, 2);
	const first = pick(FIREWORK_COLORS, random);
	const second = random() < 0.4 ? pick(FIREWORK_COLORS, random) : first;
	const sparks = [];
	for (let k = 0; k < SPARKS_PER_BURST; k++) {
		const angle = (2 * Math.PI * k) / SPARKS_PER_BURST + (random() - 0.5) * 0.12;
		// How far out the spark ends, as a share of the ring's radius.
		const reach = lerp(0.65, 1, random());
		const size = round(lerp(0.7, 1.1, random()));
		const roll = random();
		const color = roll < 0.2 ? '#fff6e5' : (roll < 0.6 ? first : second);
		sparks.push({
			key: k,
			style: {
				left: `${round(50 + 50 * reach * Math.cos(angle), 2)}%`,
				top: `${round(50 + 50 * reach * Math.sin(angle), 2)}%`,
				width: `${size}vh`,
				height: `${size}vh`,
				marginLeft: `${-size / 2}vh`,
				marginTop: `${-size / 2}vh`,
				backgroundColor: color,
				boxShadow: `0 0 0.6vh 0.15vh ${color}`
			}
		});
	}
	return {
		key: index,
		mover: ['moveA', 'moveB', 'moveC'][index % 3],
		moverStyle: timing(BURST_SECONDS * 5, delay),
		partStyle: timing(BURST_SECONDS, delay),
		flashBackground: glow(first, 0.9),
		sparks
	};
};

// Returns {falling, bursts}. Only one of the two has anything in it.
export const buildSeasonalParticles = (effect, density, seed, tier = 'high') => {
	const random = seededRandom(seed);
	if (effect === 'fireworks') {
		const burstCount = BURST_COUNTS[density] || BURST_COUNTS.normal;
		const bursts = [];
		for (let i = 0; i < burstCount; i++) bursts.push(burst(i, burstCount, random));
		return {falling: [], bursts};
	}
	if (!FALL_SECONDS[effect]) return {falling: [], bursts: []};
	const counts = FALL_COUNTS[tier] || FALL_COUNTS.high;
	const fallCount = counts[density] || counts.normal;
	const falling = [];
	for (let i = 0; i < fallCount; i++) falling.push(fallParticle(effect, random, i));
	return {falling, bursts: []};
};
