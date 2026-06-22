<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import dayjs from 'dayjs';
	import duration from 'dayjs/plugin/duration';

	dayjs.extend(duration);

	import Play from '$lib/components/icons/Play.svelte';
	import Pause from '$lib/components/icons/Pause.svelte';
	import SkipBack15 from '$lib/components/icons/SkipBack15.svelte';
	import SkipForward15 from '$lib/components/icons/SkipForward15.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	import { readAloudPlayback, settings } from '$lib/stores';
	import {
		cycleReadAloudPlaybackRate,
		formatPlaybackRateLabel,
		pauseReadAloud,
		resumeReadAloud,
		seekReadAloud,
		stopReadAloud
	} from '$lib/utils/readAloud';

	const i18n = getContext<Writable<i18nType>>('i18n');

	$: userDefaultRate = $settings.audio?.tts?.playbackRate ?? 1;
	$: playbackRateLabel = formatPlaybackRateLabel($readAloudPlayback.playbackRate);

	const formatTime = (seconds: number) => {
		const safeSeconds = Math.max(0, Math.floor(seconds));
		return dayjs.duration(safeSeconds, 'seconds').format('m:ss');
	};

	const togglePlayback = () => {
		if ($readAloudPlayback.isPaused) {
			resumeReadAloud();
		} else {
			pauseReadAloud();
		}
	};
</script>

<div
	class="mx-2 mb-1 flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2 text-sm dark:border-gray-800/50 dark:bg-gray-900/60"
>
	<button
		type="button"
		class="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
		aria-label={$readAloudPlayback.isPaused ? $i18n.t('Play') : $i18n.t('Pause')}
		on:click={togglePlayback}
	>
		{#if $readAloudPlayback.isPaused}
			<Play className="size-4" />
		{:else}
			<Pause className="size-4" />
		{/if}
	</button>

	<div class="min-w-[3rem] tabular-nums text-gray-600 dark:text-gray-300">
		{formatTime($readAloudPlayback.currentTime)}
	</div>

	<div class="flex-1"></div>

	<button
		type="button"
		class="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
		aria-label={$i18n.t('Rewind 15 seconds')}
		disabled={!$readAloudPlayback.seekEnabled}
		on:click={() => seekReadAloud(-15)}
	>
		<SkipBack15 className="size-8" />
	</button>

	<button
		type="button"
		class="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
		aria-label={$i18n.t('Forward 15 seconds')}
		disabled={!$readAloudPlayback.seekEnabled}
		on:click={() => seekReadAloud(15)}
	>
		<SkipForward15 className="size-8" />
	</button>

	<button
		type="button"
		class="min-w-[3rem] rounded-lg px-2 py-1 text-base font-medium tabular-nums text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
		aria-label={$i18n.t('Speech Playback Speed')}
		on:click={() => cycleReadAloudPlaybackRate(userDefaultRate)}
	>
		{playbackRateLabel}
	</button>

	<button
		type="button"
		class="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
		aria-label={$i18n.t('Stop playback')}
		on:click={stopReadAloud}
	>
		<XMark className="size-4" />
	</button>
</div>
