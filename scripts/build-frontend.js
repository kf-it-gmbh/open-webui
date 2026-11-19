import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Preserve upstream's local-build default; Docker supplies a smaller limit.
const heapMb = process.env.BUILD_NODE_HEAP_MB ?? '12288';
if (!/^[1-9]\d*$/.test(heapMb)) {
	console.error('BUILD_NODE_HEAP_MB must be a positive integer in MiB.');
	process.exit(1);
}

const result = spawnSync(
	process.execPath,
	[
		`--max-old-space-size=${heapMb}`,
		fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
		'build',
		...process.argv.slice(2)
	],
	{ stdio: 'inherit' }
);

if (result.error) {
	console.error(result.error);
}
if (result.signal) {
	process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
