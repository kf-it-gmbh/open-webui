import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioQueue } from './audio';

// Explicit media events let us exercise network gaps without relying on wall-clock timing.
class FakeAudio extends EventTarget {
	private source = '';
	get src() {
		return this.source;
	}
	set src(value: string) {
		this.source = value;
		this.currentTime = 0;
		this.readyState = 0;
	}
	paused = true;
	currentTime = 0;
	duration = 10;
	readyState = 0;
	playbackRate = 1;
	defaultPlaybackRate = 1;
	muted = false;
	played: string[] = [];
	play = vi.fn(async () => {
		this.paused = false;
		this.played.push(this.src);
	});
	pause() {
		this.paused = true;
	}
	load() {}
	removeAttribute() {
		this.src = '';
	}
	metadata() {
		this.dispatchEvent(new Event('loadedmetadata'));
	}
	end() {
		this.currentTime = this.duration;
		this.paused = true;
		this.dispatchEvent(new Event('ended'));
	}
}

describe('read-aloud chunk playback', () => {
	let audio: FakeAudio;
	let queue: AudioQueue;
	let stopped: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		vi.stubGlobal('document', new EventTarget());
		audio = new FakeAudio();
		queue = new AudioQueue(audio as unknown as HTMLAudioElement, () => false);
		queue.setId('response');
		stopped = vi.fn();
		queue.onStopped = stopped;
	});
	afterEach(() => {
		queue.destroy();
		vi.unstubAllGlobals();
	});

	it('continues after a slow paragraph arrives and retains elapsed time for seeking', () => {
		queue.beginGeneration();
		queue.enqueue('first');
		audio.metadata();
		audio.end();
		expect(stopped).not.toHaveBeenCalled();
		expect(queue.isPaused()).toBe(false);
		queue.enqueue('second');
		audio.metadata();
		expect(queue.getCurrentTime()).toBe(10);
		queue.endGeneration();
		audio.end();
		expect(audio.played).toEqual(['first', 'second']);
		expect(stopped).toHaveBeenCalledOnce();
		expect(stopped).toHaveBeenCalledWith({ event: 'empty-queue', id: 'response' });
	});

	it('does not replay the completed paragraph when resuming during a generation gap', () => {
		queue.beginGeneration();
		queue.enqueue('first');
		audio.metadata();
		audio.end();
		queue.pause();
		queue.play();
		expect(audio.played).toEqual(['first']);
		queue.enqueue('second');
		expect(audio.played).toEqual(['first', 'second']);
	});

	it('keeps newly generated paragraphs queued while paused', () => {
		queue.beginGeneration();
		queue.enqueue('first');
		audio.metadata();
		audio.end();
		queue.pause();
		queue.enqueue('second');
		queue.endGeneration();
		expect(stopped).not.toHaveBeenCalled();
		expect(audio.played).toEqual(['first']);
		queue.play();
		audio.metadata();
		audio.end();
		expect(audio.played).toEqual(['first', 'second']);
		expect(stopped).toHaveBeenCalledOnce();
	});

	it('finishes if generation ends after the last audio has already ended', () => {
		queue.beginGeneration();
		queue.enqueue('first');
		audio.end();
		queue.endGeneration();
		expect(stopped).toHaveBeenCalledOnce();
	});

	it('plays buffered sentences once, in order, at the configured rate', () => {
		queue.setPlaybackRate(1.5);
		queue.beginGeneration();
		queue.enqueue('one');
		queue.enqueue('two');
		queue.enqueue('three');
		queue.endGeneration();
		audio.metadata();
		audio.end();
		audio.metadata();
		audio.end();
		audio.metadata();
		audio.end();
		expect(audio.played).toEqual(['one', 'two', 'three']);
		expect(audio.defaultPlaybackRate).toBe(1.5);
		expect(stopped).toHaveBeenCalledOnce();
	});

	it('does not let superseded metadata callbacks reset a seek position', () => {
		queue.enqueue('first');
		audio.metadata();
		queue.enqueue('second');
		audio.end();
		queue.pause();
		queue.seekBy(-5);
		audio.metadata();
		expect(audio.src).toBe('first');
		expect(audio.currentTime).toBe(5);
		audio.currentTime = 7;
		audio.metadata();
		expect(audio.currentTime).toBe(7);
	});

	it('ignores failures from an old source after a new session starts', async () => {
		let reject!: (error: Error) => void;
		audio.play.mockImplementationOnce(
			() =>
				new Promise((_, fail) => {
					reject = fail;
				})
		);
		queue.enqueue('old');
		queue.stop();
		stopped.mockClear();
		queue.setId('new');
		stopped.mockClear();
		queue.enqueue('new');
		reject(new Error('superseded'));
		await Promise.resolve();
		expect(audio.src).toBe('new');
		expect(stopped).not.toHaveBeenCalled();
	});
});
