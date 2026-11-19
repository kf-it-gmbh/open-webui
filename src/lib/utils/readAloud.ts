import { get } from 'svelte/store';

import {
	audioQueue,
	readAloudPlayback,
	READ_ALOUD_PLAYBACK_DEFAULT,
	type ReadAloudPlaybackState
} from '$lib/stores';
import type { AudioQueue } from '$lib/utils/audio';

type ReadAloudSessionHandlers = {
	stop?: () => void;
	pause?: () => void;
	play?: () => void;
};

let sessionHandlers: ReadAloudSessionHandlers = {};
let browserTimer: ReturnType<typeof setInterval> | null = null;
let browserElapsed = 0;
let browserStartedAt = 0;
let browserPlaybackRate = 1;

const BASE_PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2];

export function buildPlaybackRateOptions(userSetting: number): number[] {
	if (Math.abs(userSetting - 0.5) < 0.001) {
		return [0.5, ...BASE_PLAYBACK_RATES];
	}

	const rates = [...BASE_PLAYBACK_RATES];
	const exists = rates.some((rate) => Math.abs(rate - userSetting) < 0.001);

	if (!exists) {
		rates.push(userSetting);
		rates.sort((a, b) => a - b);
	}

	return rates;
}

export function formatPlaybackRateLabel(rate: number): string {
	const normalized = Number(rate.toFixed(2));

	if (Number.isInteger(normalized)) {
		return `${normalized}x`;
	}

	return `${parseFloat(normalized.toString())}x`;
}

export function setReadAloudPlaybackRate(rate: number) {
	browserPlaybackRate = rate;
	get(audioQueue)?.setPlaybackRate(rate);
	readAloudPlayback.update((current) => ({ ...current, playbackRate: rate }));
}

export function cycleReadAloudPlaybackRate(userDefaultRate: number) {
	const currentRate = get(readAloudPlayback).playbackRate;
	const options = buildPlaybackRateOptions(userDefaultRate);
	const currentIndex = options.findIndex((rate) => Math.abs(rate - currentRate) < 0.001);
	const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % options.length;

	setReadAloudPlaybackRate(options[nextIndex]);
}

export function registerReadAloudSessionHandlers(handlers: ReadAloudSessionHandlers) {
	sessionHandlers = handlers;
}

export function clearReadAloudSessionHandlers() {
	sessionHandlers = {};
}

export function resetReadAloudPlayback() {
	if (browserTimer) {
		clearInterval(browserTimer);
		browserTimer = null;
	}

	browserElapsed = 0;
	browserStartedAt = 0;
	readAloudPlayback.set({ ...READ_ALOUD_PLAYBACK_DEFAULT });
}

export function setReadAloudPlayback(state: Partial<ReadAloudPlaybackState>) {
	readAloudPlayback.update((current) => ({ ...current, ...state }));
}

export function syncReadAloudPlaybackFromQueue(queue: AudioQueue | null) {
	if (!queue) return;

	readAloudPlayback.update((current) => ({
		...current,
		currentTime: queue.getCurrentTime(),
		totalDuration: queue.getTotalDuration(),
		isPaused: queue.isPaused()
	}));
}

export function stopReadAloud() {
	sessionHandlers.stop?.();
	clearReadAloudSessionHandlers();

	try {
		speechSynthesis.cancel();
	} catch {
		// Speech synthesis is not available in every browser.
	}

	get(audioQueue)?.stop();
	resetReadAloudPlayback();
}

export function pauseReadAloud() {
	const state = get(readAloudPlayback);

	if (state.seekEnabled) {
		get(audioQueue)?.pause();
		syncReadAloudPlaybackFromQueue(get(audioQueue));
		readAloudPlayback.update((current) => ({ ...current, isPaused: true }));
	} else {
		sessionHandlers.pause?.();
		pauseBrowserSpeechTimer();
		readAloudPlayback.update((current) => ({ ...current, isPaused: true }));
	}
}

export function resumeReadAloud() {
	const state = get(readAloudPlayback);

	if (state.seekEnabled) {
		get(audioQueue)?.play();
		syncReadAloudPlaybackFromQueue(get(audioQueue));
		readAloudPlayback.update((current) => ({ ...current, isPaused: false }));
	} else {
		sessionHandlers.play?.();
		resumeBrowserSpeechTimer();
		readAloudPlayback.update((current) => ({ ...current, isPaused: false }));
	}
}

export function seekReadAloud(deltaSec: number) {
	const state = get(readAloudPlayback);
	if (!state.seekEnabled) return;

	get(audioQueue)?.seekBy(deltaSec);
	syncReadAloudPlaybackFromQueue(get(audioQueue));
}

export function startBrowserSpeechTimer(playbackRate = 1) {
	browserPlaybackRate = playbackRate;
	browserElapsed = 0;
	browserStartedAt = Date.now();

	if (browserTimer) {
		clearInterval(browserTimer);
	}

	browserTimer = setInterval(() => {
		const current = get(readAloudPlayback);
		if (!current.active || current.isPaused) return;

		const elapsed = browserElapsed + ((Date.now() - browserStartedAt) / 1000) * browserPlaybackRate;
		readAloudPlayback.update((state) => ({ ...state, currentTime: elapsed }));
	}, 250);
}

export function pauseBrowserSpeechTimer() {
	if (!browserStartedAt) return;

	browserElapsed += ((Date.now() - browserStartedAt) / 1000) * browserPlaybackRate;
	browserStartedAt = 0;
}

export function resumeBrowserSpeechTimer() {
	browserStartedAt = Date.now();
}

export function finishReadAloudPlayback() {
	clearReadAloudSessionHandlers();
	resetReadAloudPlayback();
}
