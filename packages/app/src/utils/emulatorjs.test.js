jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (s) => s}));
jest.mock('../services/serverLogger', () => ({
	__esModule: true,
	default: {debug: jest.fn(), error: jest.fn(), LOG_CATEGORIES: {APP: 'app'}}
}));

let startEmulator;
let destroyEmulator;

// Stands in for the class loader.js builds, so a second launch goes through the cached path.
class FakeEmulator {
	constructor (selector, config) {
		this.config = config;
		FakeEmulator.configs.push(config);
	}

	on (event, cb) {
		if (event === 'ready') setTimeout(cb, 0);
	}
}

const launch = (opts) => startEmulator({selector: '#game', core: 'nes', gameUrl: 'blob:rom', ...opts});

// jsdom never runs the appended loader.js, so this does what it would: build the emulator from
// the EJS_ globals and fire ready.
const launchThroughLoader = async (opts) => {
	const started = launch(opts);
	window.EJS_emulator = new FakeEmulator('#game', {gameUrl: window.EJS_gameUrl, loadState: window.EJS_loadStateURL});
	window.EJS_ready();
	await started;
};

describe('startEmulator save state', () => {
	beforeEach(() => {
		jest.resetModules();
		({startEmulator, destroyEmulator} = require('./emulatorjs'));
		FakeEmulator.configs = [];
	});

	afterEach(() => {
		destroyEmulator();
	});

	test('hands the save to EmulatorJS through the loader', async () => {
		const save = new Uint8Array([1, 2, 3]);

		await launchThroughLoader({stateBytes: save});

		expect(FakeEmulator.configs[0].loadState).toBe(save);
	});

	test('leaves no save behind for the next launch', async () => {
		await launchThroughLoader({stateBytes: new Uint8Array([1])});

		destroyEmulator();

		expect(window.EJS_loadStateURL).toBeUndefined();
	});

	test('hands the save to a cached emulator', async () => {
		const save = new Uint8Array([4, 5]);
		await launchThroughLoader();
		destroyEmulator();

		await launch({stateBytes: save});

		expect(FakeEmulator.configs[1].loadState).toBe(save);
	});

	test('a cached emulator never loads the previous launch\'s save', async () => {
		await launchThroughLoader({stateBytes: new Uint8Array([6])});
		destroyEmulator();

		await launch();

		expect(FakeEmulator.configs[1].loadState).toBeUndefined();
	});
});
