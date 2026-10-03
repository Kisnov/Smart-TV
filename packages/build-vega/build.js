/* eslint-disable no-console */
// Builds Moonfin for Vega OS (Fire TV).
//
// The web app is packed with Enact like the other platforms, prepared for life at
// file:///pkg/assets, and copied into the React Native shell under shell/, which
// hosts it in the Vega WebView. The shell is then built into a .vpkg with the Vega
// SDK, so that last step needs `vega` on the PATH. Pass --no-vpkg to stop once the
// assets are in place.
//
//   node build.js [--debug] [--no-vpkg] [--install] [--launch]
//
// The package version follows packages/app/package.json.
const {execSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const {LINT_DIRS, runLintGate} = require('../../scripts/lint-gate');

const APP_DIR = path.resolve(__dirname, '..', 'app');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SHELL_DIR = path.join(__dirname, 'shell');
const ASSETS_DIR = path.join(SHELL_DIR, 'assets');
const INJECT_DIR = path.join(__dirname, 'inject');

// Files the subtitle workers need. They are packaged as scripts the worker shim
// can load from file://, see inject/worker-shim.js.
const WORKER_ASSETS = [
	path.join(ROOT_DIR, 'node_modules', 'libpgs', 'dist', 'libpgs.worker.js'),
	path.join(ROOT_DIR, 'node_modules', 'libass-wasm', 'dist', 'js', 'subtitles-octopus-worker.js'),
	path.join(ROOT_DIR, 'node_modules', 'libass-wasm', 'dist', 'js', 'subtitles-octopus-worker.wasm'),
	{src: path.join(ROOT_DIR, 'node_modules', '@enact', 'sandstone', 'fonts', 'MuseoSans', 'MuseoSans-Light.ttf'), name: 'ass-fallback-font.ttf'}
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);

const run = (cmd, opts = {}) => {
	console.log(`> ${cmd}`);
	execSync(cmd, {stdio: 'inherit', ...opts});
};

const copyDirRecursive = (src, dest) => {
	fs.mkdirSync(dest, {recursive: true});
	for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
		else fs.copyFileSync(srcPath, destPath);
	}
};

// Sandstone's CSS asks for its fonts at /node_modules/@enact/sandstone/fonts, an
// absolute path nothing serves, so the weights the app uses travel with it.
const SANDSTONE_FONTS = path.join(ROOT_DIR, 'node_modules', '@enact', 'sandstone', 'fonts');
const BUNDLED_FONTS = ['Sandstone_Icons.ttf', 'MuseoSans/LICENSE.txt', 'MuseoSans/MuseoSans-Light.ttf', 'MuseoSans/MuseoSans-Medium.ttf', 'MuseoSans/MuseoSans-Bold.ttf', 'MuseoSans/MuseoSans-Black.ttf'];

const bundleSandstoneFonts = (dir) => {
	const dest = path.join(dir, 'fonts');
	fs.mkdirSync(path.join(dest, 'MuseoSans'), {recursive: true});
	for (const file of BUNDLED_FONTS) {
		fs.copyFileSync(path.join(SANDSTONE_FONTS, file), path.join(dest, file));
	}
	for (const file of fs.readdirSync(dir).filter((entry) => entry.endsWith('.css'))) {
		const cssPath = path.join(dir, file);
		const css = fs.readFileSync(cssPath, 'utf8');
		const patched = css.replace(/url\(\/node_modules\/@enact\/sandstone\/fonts\//g, 'url(fonts/');
		if (patched !== css) fs.writeFileSync(cssPath, patched);
	}
};

const writeWorkerAssets = (dir) => {
	const assetDir = path.join(dir, 'vega-assets');
	fs.mkdirSync(assetDir, {recursive: true});
	for (const asset of WORKER_ASSETS) {
		const src = asset.src || asset;
		const name = asset.name || path.basename(src);
		if (!fs.existsSync(src)) {
			console.warn(`  ${name} not found, subtitle rendering may degrade`);
			continue;
		}
		const base64 = fs.readFileSync(src).toString('base64');
		fs.writeFileSync(path.join(assetDir, `${name}.js`), `__moonfinVegaAsset(${JSON.stringify(name)},${JSON.stringify(base64)});\n`);
		console.log(`  Packed ${name}`);
	}
};

const copyInjectScripts = (dir) => {
	const vegaDir = path.join(dir, 'vega');
	fs.mkdirSync(vegaDir, {recursive: true});
	for (const file of fs.readdirSync(INJECT_DIR)) {
		fs.copyFileSync(path.join(INJECT_DIR, file), path.join(vegaDir, file));
	}
};

const injectScriptTags = (html) => {
	const tags = fs.readdirSync(INJECT_DIR).sort()
		.map((file) => `<script src="vega/${file}"></script>`)
		.join('\n\t');
	return html.replace(/<script defer="defer" src="main\.js"><\/script>/, `${tags}\n\t<script defer="defer" src="main.js"></script>`);
};

const buildApp = (appPkg) => {
	const ENACT_ALIAS = JSON.stringify({
		'@moonfin/platform-webos': path.resolve(__dirname, '..', 'platform-webos', 'src'),
		'@moonfin/platform-tizen': path.resolve(__dirname, '..', 'platform-tizen', 'src'),
		'@moonfin/platform-vega': path.resolve(__dirname, '..', 'platform-vega', 'src'),
		'@moonfin/app': APP_DIR
	});

	console.log('Applying Enact compatibility patches...');
	require(path.join(ROOT_DIR, 'scripts', 'patch-enact-legacy.js'));

	console.log('Cleaning previous build...');
	run('npx enact clean', {cwd: APP_DIR});

	console.log('\n Running lint checks...');
	for (const dir of LINT_DIRS) {
		if (!runLintGate(dir, (msg) => console.log(`> ${msg}`))) {
			console.error('Lint check failed: warnings/errors detected.');
			process.exit(1);
		}
	}

	console.log('\n Checking CSS against the browser targets...');
	if (spawnSync('node', [path.join(ROOT_DIR, 'scripts', 'check-legacy-css.js')], {stdio: 'inherit'}).status !== 0) {
		console.error('CSS target check failed.');
		process.exit(1);
	}

	console.log('\n Building with Enact...');
	run('npx enact pack -p', {
		cwd: APP_DIR,
		env: {
			...process.env,
			BROWSERSLIST_CONFIG: path.join(__dirname, '.browserslistrc'),
			ENACT_ALIAS,
			REACT_APP_VERSION: appPkg.version,
			REACT_APP_PLATFORM: 'vega'
		}
	});

	console.log('\n Copying build output into the shell...');
	fs.rmSync(ASSETS_DIR, {recursive: true, force: true});
	copyDirRecursive(path.join(APP_DIR, 'dist'), ASSETS_DIR);
	fs.rmSync(path.join(APP_DIR, 'dist'), {recursive: true, force: true});

	console.log('\n Copying banner...');
	const bannerSrc = path.join(APP_DIR, 'resources', 'banner-dark.png');
	fs.mkdirSync(path.join(ASSETS_DIR, 'resources'), {recursive: true});
	fs.copyFileSync(bannerSrc, path.join(ASSETS_DIR, 'resources', 'banner-dark.png'));

	console.log('\n Packing subtitle workers for file://...');
	writeWorkerAssets(ASSETS_DIR);

	console.log('\n Patching index.html...');
	copyInjectScripts(ASSETS_DIR);
	const indexPath = path.join(ASSETS_DIR, 'index.html');
	fs.writeFileSync(indexPath, injectScriptTags(fs.readFileSync(indexPath, 'utf8')));

	console.log('\n Pruning ilib locale data...');
	require(path.join(ROOT_DIR, 'scripts', 'prune-ilib-locales.js'))(ASSETS_DIR);

	console.log('\n Pruning bundled translation copies...');
	require(path.join(ROOT_DIR, 'scripts', 'prune-bundled-strings.js'))(ASSETS_DIR);

	console.log('\n Bundling Sandstone fonts...');
	bundleSandstoneFonts(ASSETS_DIR);
};

const syncManifestVersion = (version) => {
	const manifestPath = path.join(SHELL_DIR, 'manifest.toml');
	const manifest = fs.readFileSync(manifestPath, 'utf8');
	const updated = manifest.replace(/^(version = ")[^"]*(")/m, `$1${version}$2`);
	if (updated !== manifest) fs.writeFileSync(manifestPath, updated);
};

// The store wants a build number that only goes up, so it follows the version.
const buildNumber = (version) => {
	const [major, minor, patch] = version.split('.').map(Number);
	return major * 10000 + minor * 100 + patch;
};

const buildVpkg = (version) => {
	if (!fs.existsSync(path.join(SHELL_DIR, 'node_modules'))) {
		console.log('\n Installing shell dependencies...');
		run('npm install --no-audit --no-fund', {cwd: SHELL_DIR});
	}

	const buildType = flag('--debug') ? 'Debug' : 'Release';
	console.log(`\n Building the Vega package (${buildType})...`);
	run(`npx react-native build-vega --build-type ${buildType} --build-number ${buildNumber(version)}`, {cwd: SHELL_DIR});

	const outDir = path.join(SHELL_DIR, 'build', `armv7-${buildType.toLowerCase()}`);
	const built = fs.existsSync(outDir) ? fs.readdirSync(outDir).find((file) => file.endsWith('.vpkg')) : null;
	if (!built) throw new Error(`No .vpkg found under ${outDir}`);

	const prefix = `Moonfin_Vega_${buildType === 'Debug' ? 'Debug_' : ''}`;
	for (const file of fs.readdirSync(ROOT_DIR).filter((entry) => entry.startsWith(prefix) && /^\d+\.\d+\.\d+\.vpkg$/.test(entry.slice(prefix.length)))) {
		fs.unlinkSync(path.join(ROOT_DIR, file));
	}
	const finalName = `${prefix}${version}.vpkg`;
	fs.copyFileSync(path.join(outDir, built), path.join(ROOT_DIR, finalName));
	console.log(`  ${finalName}`);

	if (flag('--install') || flag('--launch')) {
		run(`vega device install-app --packagePath ${JSON.stringify(path.join(ROOT_DIR, finalName))}`);
	}
	if (flag('--launch')) {
		run('vega device launch-app --appName org.moonfin.androidtv.main');
	}
};

try {
	const appPkg = require(path.join(APP_DIR, 'package.json'));

	console.log(' Building Moonfin for Vega...\n');
	buildApp(appPkg);
	syncManifestVersion(appPkg.version);

	if (flag('--no-vpkg')) {
		console.log(`\n Assets ready in ${ASSETS_DIR}. Run again without --no-vpkg where the Vega SDK is installed to build the package.`);
	} else {
		buildVpkg(appPkg.version);
	}

	console.log('\n Build complete!');
} catch (err) {
	console.error('\n Build failed:', err.message);
	process.exit(1);
}
