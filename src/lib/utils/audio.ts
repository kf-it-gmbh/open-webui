type AudioQueueEvent = 'stop' | 'empty-queue' | 'id-change';

interface AudioQueueStopDetail {
	event: AudioQueueEvent;
	id: string | null;
}

export type OnStoppedCallback = (detail: AudioQueueStopDetail) => void;

interface AudioChunk {
	url: string;
	duration: number;
}

export class AudioQueue {
	private audio: HTMLAudioElement;
	private chunks: AudioChunk[] = [];
	private currentIndex = -1;
	private userPaused = false;
	private readonly _onEnded = () => this.#onEnded();
	private readonly _onTimeUpdate = () => this.#notifyStateChange();
	private readonly _onLoadedMetadata = () => this.#onLoadedMetadata();

	id: string | null = null;
	onStopped: OnStoppedCallback | null = null;
	onStateChange: (() => void) | null = null;

	constructor(audioElement: HTMLAudioElement) {
		this.audio = audioElement;
		this.audio.addEventListener('ended', this._onEnded);
		this.audio.addEventListener('timeupdate', this._onTimeUpdate);
		this.audio.addEventListener('loadedmetadata', this._onLoadedMetadata);
	}

	setId(newId: string) {
		if (this.id === newId) return;

		this.#halt(false);
		this.id = newId;
		this.onStopped?.({ event: 'id-change', id: newId });
		this.#notifyStateChange();
	}

	setPlaybackRate(rate: number) {
		this.audio.defaultPlaybackRate = rate;
		this.audio.playbackRate = rate;
	}

	enqueue(url: string) {
		this.chunks.push({ url, duration: 0 });

		if (this.currentIndex === -1 && !this.userPaused) {
			this.#loadChunk(0);
		}

		this.#notifyStateChange();
	}

	play() {
		this.userPaused = false;

		if (this.currentIndex === -1) {
			if (this.chunks.length > 0) {
				this.#loadChunk(0);
			}
			return;
		}

		this.audio.play().catch(() => {});
		this.#notifyStateChange();
	}

	pause() {
		this.userPaused = true;
		this.audio.pause();
		this.#notifyStateChange();
	}

	seekBy(deltaSec: number) {
		if (this.chunks.length === 0) return;

		const targetTime = Math.max(
			0,
			Math.min(this.getCurrentTime() + deltaSec, this.getTotalDuration())
		);
		const { index, offset } = this.#resolveTimeToPosition(targetTime);

		if (index === this.currentIndex && this.audio.src === this.chunks[index]?.url) {
			this.audio.currentTime = offset;
		} else {
			this.#loadChunk(index, offset);
		}

		this.#notifyStateChange();
	}

	getCurrentTime(): number {
		if (this.currentIndex < 0) return 0;

		let time = 0;
		for (let i = 0; i < this.currentIndex; i++) {
			time += this.chunks[i]?.duration ?? 0;
		}

		return time + (this.audio.currentTime || 0);
	}

	getTotalDuration(): number {
		return this.chunks.reduce((total, chunk) => total + (chunk.duration || 0), 0);
	}

	isPaused(): boolean {
		return this.userPaused || this.audio.paused;
	}

	isActive(): boolean {
		return this.chunks.length > 0 || this.currentIndex >= 0;
	}

	stop() {
		this.#halt(true);
		this.onStopped?.({ event: 'stop', id: this.id });
		this.#notifyStateChange();
	}

	destroy() {
		this.audio.removeEventListener('ended', this._onEnded);
		this.audio.removeEventListener('timeupdate', this._onTimeUpdate);
		this.audio.removeEventListener('loadedmetadata', this._onLoadedMetadata);
		this.#halt(false);
		this.onStopped = null;
		this.onStateChange = null;
	}

	#onEnded() {
		if (this.userPaused) return;

		const nextIndex = this.currentIndex + 1;
		if (nextIndex < this.chunks.length) {
			this.#loadChunk(nextIndex);
			return;
		}

		this.#halt(false);
		this.onStopped?.({ event: 'empty-queue', id: this.id });
		this.#notifyStateChange();
	}

	#onLoadedMetadata() {
		const chunk = this.chunks[this.currentIndex];
		if (chunk && Number.isFinite(this.audio.duration)) {
			chunk.duration = this.audio.duration;
		}
		this.#notifyStateChange();
	}

	#loadChunk(index: number, offset = 0) {
		const chunk = this.chunks[index];
		if (!chunk) return;

		this.currentIndex = index;
		this.audio.src = chunk.url;

		const applyOffset = () => {
			if (Number.isFinite(this.audio.duration)) {
				chunk.duration = this.audio.duration;
			}
			this.audio.currentTime = offset;
			this.#notifyStateChange();
		};

		if (this.audio.readyState >= 1) {
			applyOffset();
		} else {
			const onMeta = () => {
				this.audio.removeEventListener('loadedmetadata', onMeta);
				applyOffset();
			};
			this.audio.addEventListener('loadedmetadata', onMeta);
		}

		if (!this.userPaused) {
			this.audio.play().catch(() => {});
		}

		this.#notifyStateChange();
	}

	#resolveTimeToPosition(targetTime: number): { index: number; offset: number } {
		let remaining = targetTime;

		for (let i = 0; i < this.chunks.length; i++) {
			const duration = this.chunks[i].duration;

			if (duration > 0) {
				if (remaining <= duration) {
					return { index: i, offset: remaining };
				}
				remaining -= duration;
				continue;
			}

			if (i === this.currentIndex) {
				return { index: i, offset: Math.min(remaining, this.audio.currentTime || 0) };
			}
		}

		const lastIndex = this.chunks.length - 1;
		if (lastIndex >= 0) {
			const lastDuration = this.chunks[lastIndex].duration;
			return {
				index: lastIndex,
				offset: lastDuration > 0 ? lastDuration : this.audio.currentTime || 0
			};
		}

		return { index: 0, offset: 0 };
	}

	#notifyStateChange() {
		this.onStateChange?.();
	}

	#halt(fireStateChange: boolean) {
		this.audio.pause();
		this.audio.currentTime = 0;
		this.audio.removeAttribute('src');
		this.audio.load();
		this.chunks = [];
		this.currentIndex = -1;
		this.userPaused = false;

		if (fireStateChange) {
			this.#notifyStateChange();
		}
	}
}
