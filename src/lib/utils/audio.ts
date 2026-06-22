type AudioQueueEvent = 'stop' | 'empty-queue' | 'id-change' | 'error';

interface AudioQueueStopDetail {
	event: AudioQueueEvent;
	id: string | null;
}

const SILENT_WAV =
	'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

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
	private readonly _onGesture = () => this.#unlock();
	private readonly _onEnded = () => this.#onEnded();
	private readonly _onTimeUpdate = () => this.#notifyStateChange();
	private readonly _onLoadedMetadata = () => this.#onLoadedMetadata();

	id: string | null = null;
	onStopped: OnStoppedCallback | null = null;
	onStateChange: (() => void) | null = null;

	constructor(audioElement: HTMLAudioElement, private isAutoPlaybackEnabled: () => boolean) {
		this.audio = audioElement;
		document.addEventListener('pointerdown', this._onGesture, true);
		document.addEventListener('keydown', this._onGesture, true);
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

	/** Play silence inside the first user gesture so WebKit allows later programmatic playback. */
	#unlock() {
		if (this.currentIndex >= 0 || !this.audio.paused || !this.isAutoPlaybackEnabled()) return;

		this.audio.src = SILENT_WAV;
		this.audio
			.play()
			.then(() => this.#removeGestureListeners())
			.catch(() => {})
			.finally(() => {
				if (this.currentIndex >= 0) return;

				this.audio.pause();
				if (this.chunks.length) this.#loadChunk(0);
			});
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
		this.#removeGestureListeners();
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

	#removeGestureListeners() {
		document.removeEventListener('pointerdown', this._onGesture, true);
		document.removeEventListener('keydown', this._onGesture, true);
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

export const notificationSoundStyles = ['chime', 'soft', 'bell', 'tap'] as const;
export type NotificationSoundStyle = (typeof notificationSoundStyles)[number];

type NotificationTone = {
	frequency: number;
	duration: number;
	volume: number;
	delay?: number;
	endFrequency?: number;
};

const notificationTones: Record<NotificationSoundStyle, NotificationTone[]> = {
	chime: [
		{ frequency: 659.25, duration: 0.36, volume: 0.08 },
		{ frequency: 880, duration: 0.48, volume: 0.06, delay: 0.09 }
	],
	soft: [
		{ frequency: 440, duration: 0.3, volume: 0.07 },
		{ frequency: 660, duration: 0.24, volume: 0.025 }
	],
	bell: [
		{ frequency: 1046.5, duration: 0.6, volume: 0.06 },
		{ frequency: 2093, duration: 0.24, volume: 0.025 },
		{ frequency: 2900, duration: 0.13, volume: 0.012 }
	],
	tap: [{ frequency: 200, endFrequency: 90, duration: 0.07, volume: 0.16 }]
};

let notificationContext: AudioContext | null = null;
let notificationSoundEnabled = true;
const notificationVoices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();

function stopNotificationVoices() {
	if (!notificationContext) return;
	const now = notificationContext.currentTime;
	for (const { oscillator, gain } of notificationVoices) {
		gain.gain.cancelScheduledValues(now);
		gain.gain.setValueAtTime(gain.gain.value, now);
		gain.gain.linearRampToValueAtTime(0, now + 0.02);
		oscillator.stop(now + 0.02);
	}
	notificationVoices.clear();
}

export function setNotificationSoundEnabled(enabled: boolean) {
	notificationSoundEnabled = enabled;
	if (!enabled) stopNotificationVoices();
}

// Unlock inside a user gesture so later background completions can make sound.
export async function unlockNotificationAudio(): Promise<boolean> {
	if (
		!notificationSoundEnabled ||
		typeof window === 'undefined' ||
		navigator.userActivation?.hasBeenActive === false ||
		!window.AudioContext
	)
		return false;
	try {
		notificationContext ??= new AudioContext();
		if (notificationContext.state === 'suspended') await notificationContext.resume();
		return notificationContext.state === 'running';
	} catch {
		return false;
	}
}

export async function playNotificationSound(
	style: NotificationSoundStyle = 'chime'
): Promise<boolean> {
	if (!(await unlockNotificationAudio()) || !notificationSoundEnabled || !notificationContext)
		return false;
	stopNotificationVoices();
	const selected = notificationSoundStyles.includes(style) ? style : 'chime';
	for (const tone of notificationTones[selected]) {
		const oscillator = notificationContext.createOscillator();
		const gain = notificationContext.createGain();
		const start = notificationContext.currentTime + (tone.delay ?? 0);
		oscillator.frequency.setValueAtTime(tone.frequency, start);
		if (tone.endFrequency) {
			oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, start + tone.duration);
		}
		gain.gain.setValueAtTime(0, start);
		gain.gain.linearRampToValueAtTime(tone.volume, start + (selected === 'soft' ? 0.03 : 0.005));
		gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
		oscillator.connect(gain).connect(notificationContext.destination);
		const voice = { oscillator, gain };
		notificationVoices.add(voice);
		oscillator.onended = () => {
			oscillator.disconnect();
			gain.disconnect();
			notificationVoices.delete(voice);
		};
		oscillator.start(start);
		oscillator.stop(start + tone.duration + 0.02);
	}
	return true;
}
