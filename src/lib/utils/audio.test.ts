import { describe, expect, it, vi } from 'vitest';

import { AudioQueue } from './audio';

function createMockAudioElement() {
	let src = '';
	let defaultPlaybackRate = 1;
	let playbackRate = 1;
	let paused = true;
	let duration = 0;
	let readyState = 0;
	const listeners = new Map<string, Set<EventListener>>();

	const audio = {
		get src() {
			return src;
		},
		set src(value: string) {
			src = value;
			playbackRate = defaultPlaybackRate;
			duration = value === 'blob:first' ? 10 : value === 'blob:second' ? 20 : 0;
			readyState = src ? 1 : 0;
			queueMicrotask(() => {
				listeners.get('loadedmetadata')?.forEach((listener) => listener(new Event('loadedmetadata')));
			});
		},
		get defaultPlaybackRate() {
			return defaultPlaybackRate;
		},
		set defaultPlaybackRate(value: number) {
			defaultPlaybackRate = value;
		},
		get playbackRate() {
			return playbackRate;
		},
		set playbackRate(value: number) {
			playbackRate = value;
		},
		get paused() {
			return paused;
		},
		get duration() {
			return duration;
		},
		get readyState() {
			return readyState;
		},
		play: vi.fn(() => {
			paused = false;
			return Promise.resolve();
		}),
		pause: vi.fn(() => {
			paused = true;
		}),
		currentTime: 0,
		removeAttribute: vi.fn((name: string) => {
			if (name === 'src') {
				src = '';
				duration = 0;
				readyState = 0;
			}
		}),
		load: vi.fn(),
		addEventListener: vi.fn((type: string, listener: EventListener) => {
			if (!listeners.has(type)) {
				listeners.set(type, new Set());
			}
			listeners.get(type)?.add(listener);
		}),
		removeEventListener: vi.fn((type: string, listener: EventListener) => {
			listeners.get(type)?.delete(listener);
		}),
		dispatchEvent: vi.fn((event: Event) => {
			listeners.get(event.type)?.forEach((listener) => listener(event));
			return true;
		})
	};

	return audio as unknown as HTMLAudioElement & {
		dispatchEvent: (event: Event) => boolean;
	};
}

describe('AudioQueue', () => {
	it('preserves playback rate when a new source is assigned', () => {
		const audio = createMockAudioElement();
		const queue = new AudioQueue(audio);

		queue.setPlaybackRate(2);
		queue.enqueue('blob:first');

		expect(audio.defaultPlaybackRate).toBe(2);
		expect(audio.playbackRate).toBe(2);
	});

	it('preserves playback rate when advancing to the next queued source', async () => {
		const audio = createMockAudioElement();
		const queue = new AudioQueue(audio);

		queue.setPlaybackRate(2);
		queue.enqueue('blob:first');
		queue.enqueue('blob:second');
		await Promise.resolve();
		audio.dispatchEvent(new Event('ended'));

		expect(audio.defaultPlaybackRate).toBe(2);
		expect(audio.playbackRate).toBe(2);
		expect(audio.src).toBe('blob:second');
	});

	it('updates both playback rate properties when speed changes during playback', () => {
		const audio = createMockAudioElement();
		const queue = new AudioQueue(audio);

		queue.setPlaybackRate(2);
		queue.enqueue('blob:first');

		queue.setPlaybackRate(0.5);

		expect(audio.defaultPlaybackRate).toBe(0.5);
		expect(audio.playbackRate).toBe(0.5);
	});

	it('keeps the default 1x playback rate when no custom speed is set', () => {
		const audio = createMockAudioElement();
		const queue = new AudioQueue(audio);

		queue.enqueue('blob:first');

		expect(audio.defaultPlaybackRate).toBe(1);
		expect(audio.playbackRate).toBe(1);
	});

	it('pauses and resumes without losing queued chunks', async () => {
		const audio = createMockAudioElement();
		const queue = new AudioQueue(audio);

		queue.enqueue('blob:first');
		queue.enqueue('blob:second');
		await Promise.resolve();

		queue.pause();
		expect(queue.isPaused()).toBe(true);
		expect(audio.pause).toHaveBeenCalled();

		queue.play();
		expect(queue.isPaused()).toBe(false);
		expect(audio.play).toHaveBeenCalled();
		expect(audio.src).toBe('blob:first');
	});

	it('does not auto-advance to the next chunk while paused', async () => {
		const audio = createMockAudioElement();
		const queue = new AudioQueue(audio);

		queue.enqueue('blob:first');
		queue.enqueue('blob:second');
		await Promise.resolve();

		queue.pause();
		audio.dispatchEvent(new Event('ended'));

		expect(audio.src).toBe('blob:first');
	});

	it('seeks backward across chunk boundaries', async () => {
		const audio = createMockAudioElement();
		const queue = new AudioQueue(audio);

		queue.enqueue('blob:first');
		queue.enqueue('blob:second');
		await Promise.resolve();
		audio.dispatchEvent(new Event('ended'));
		await Promise.resolve();

		audio.currentTime = 5;
		queue.seekBy(-15);

		expect(audio.src).toBe('blob:first');
		expect(audio.currentTime).toBe(0);
	});

	it('seeks forward within the current chunk', async () => {
		const audio = createMockAudioElement();
		const queue = new AudioQueue(audio);

		queue.enqueue('blob:first');
		await Promise.resolve();

		audio.currentTime = 2;
		queue.seekBy(5);

		expect(audio.src).toBe('blob:first');
		expect(audio.currentTime).toBe(7);
	});

	it('reports current and total duration across chunks', async () => {
		const audio = createMockAudioElement();
		const queue = new AudioQueue(audio);

		queue.enqueue('blob:first');
		queue.enqueue('blob:second');
		await Promise.resolve();

		expect(queue.getTotalDuration()).toBe(10);
		audio.currentTime = 4;
		expect(queue.getCurrentTime()).toBe(4);

		audio.dispatchEvent(new Event('ended'));
		await Promise.resolve();
		expect(queue.getTotalDuration()).toBe(30);
		audio.currentTime = 6;
		expect(queue.getCurrentTime()).toBe(16);
	});
});
