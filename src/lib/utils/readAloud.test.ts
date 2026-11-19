import { describe, expect, it } from 'vitest';

import { buildPlaybackRateOptions, formatPlaybackRateLabel } from './readAloud';

describe('readAloud playback rates', () => {
	it('uses the standard rate ladder when the user default is 1x', () => {
		expect(buildPlaybackRateOptions(1)).toEqual([1, 1.25, 1.5, 1.75, 2]);
	});

	it('prepends 0.5x when the user default is 0.5x', () => {
		expect(buildPlaybackRateOptions(0.5)).toEqual([0.5, 1, 1.25, 1.5, 1.75, 2]);
	});

	it('inserts a custom user default such as 1.6x in sorted order', () => {
		expect(buildPlaybackRateOptions(1.6)).toEqual([1, 1.25, 1.5, 1.6, 1.75, 2]);
	});

	it('formats playback rate labels', () => {
		expect(formatPlaybackRateLabel(1)).toBe('1x');
		expect(formatPlaybackRateLabel(1.25)).toBe('1.25x');
		expect(formatPlaybackRateLabel(1.6)).toBe('1.6x');
	});
});
