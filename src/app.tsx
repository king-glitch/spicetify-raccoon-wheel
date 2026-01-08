// This code is a copy of https://github.com/BlafKing/spicetify-cat-jam-synced but with some modifications to make it work with the Raccoon-Wheel extension
import { SettingsSection } from "spcr-settings";
import {
    calculateDynamicPlaybackRate,
    DEFAULT_VIDEO_BPM,
    type AudioData,
    type AudioFeatures,
    type Beat,
} from "./logic";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_VIDEO_SIZE = 100;
const DEFAULT_VIDEO_URL =
    "https://github.com/king-glitch/spicetify-raccoon-wheel/raw/main/resources/husky.webm";
const VIDEO_ELEMENT_ID = "raccoonwheel-webm";

const VIDEO_OPTIONS = {
    Husky: "https://github.com/king-glitch/spicetify-raccoon-wheel/raw/main/resources/husky.webm",
    Pedro: "https://github.com/king-glitch/spicetify-raccoon-wheel/raw/main/resources/pedro.webm",
    Chika: "https://github.com/king-glitch/spicetify-raccoon-wheel/raw/main/resources/chika.webm",
    Trump: "https://github.com/king-glitch/spicetify-raccoon-wheel/raw/main/resources/trump.webm",
    Rikka: "https://github.com/king-glitch/spicetify-raccoon-wheel/raw/main/resources/rikka.webm",
    Loli: "https://github.com/king-glitch/spicetify-raccoon-wheel/raw/main/resources/loli.webm",
    Chopper:
        "https://github.com/king-glitch/spicetify-raccoon-wheel/raw/main/resources/chopper.webm",
    Custom: "custom",
} as const;

const SELECTORS = {
    BOTTOM_PLAYER: ".main-nowPlayingWidget-coverArt",
    MAIN_COVER_ART: ".main-nowPlayingView-coverArt",
    MAIN_COVER_ART_CONTAINER: ".main-nowPlayingView-coverArtContainer",
} as const;

const STYLES = {
    BOTTOM_PLAYER:
        "width: 56px; height: 56px; position: absolute; z-index: 10; pointer-events: none; left: 0;",
    getMainCoverArt: (size: number, width?: string, height?: string) =>
        `width: ${width || size + "%"}; height: ${
            height || size + "%"
        }; max-width: 100%; max-height: 100%; object-fit: contain; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; z-index: 10;`,
} as const;

// ============================================================================
// Settings
// ============================================================================

const settings = new SettingsSection(
    "Raccoon-Wheel Settings",
    "raccoonwheel-settings"
);
let globalAudioData: AudioData | null = null;
let isCreatingVideo = false;

// ============================================================================
// BPM & Playback Functions
// ============================================================================

/**
 * Wrapper to get dynamic rate using current settings
 */
function getDynamicRate(progress: number, data: AudioData | null): number {
    let videoDefaultBPM = Number(
        settings.getFieldValue("raccoonwheel-webm-bpm")
    );
    if (!videoDefaultBPM) {
        videoDefaultBPM = DEFAULT_VIDEO_BPM;
    }
    return calculateDynamicPlaybackRate(progress, data, videoDefaultBPM);
}

/**
 * Adjusts the video playback rate based on the current track's BPM (fallback)
 */
async function getPlaybackRate(audioData: AudioData | null): Promise<number> {
    let videoDefaultBPM = Number(
        settings.getFieldValue("raccoonwheel-webm-bpm")
    );
    console.log(videoDefaultBPM);
    if (!videoDefaultBPM) {
        videoDefaultBPM = DEFAULT_VIDEO_BPM;
    }

    if (audioData?.track) {
        const trackBPM = audioData.track.tempo;
        const bpmMethod = settings.getFieldValue(
            "raccoonwheel-webm-bpm-method"
        );
        let bpmToUse = trackBPM;

        if (bpmMethod !== "Track BPM") {
            console.log(
                "[Raccoon-Wheel] Using danceability, energy and track BPM to calculate better BPM"
            );
            bpmToUse = await getBetterBPM(trackBPM);
            console.log("[Raccoon-Wheel] Better BPM:", bpmToUse);
        }

        let playbackRate = 1;
        if (bpmToUse) {
            playbackRate = bpmToUse / videoDefaultBPM;
        }
        console.log("[Raccoon-Wheel] Track BPM:", trackBPM);
        console.log(
            "[Raccoon-Wheel] raccoon jam synchronized, playback rate set to:",
            playbackRate
        );

        return playbackRate;
    } else {
        console.warn(
            "[Raccoon-Wheel] BPM data not available for this track, raccoon will not be jamming accurately :("
        );
        return 1;
    }
}

/**
 * Fetches audio data from Spicetify API with retry handling
 */
async function fetchAudioData(
    retryDelay = 200,
    maxRetries = 10
): Promise<AudioData | null> {
    try {
        const audioData: AudioData = await Spicetify.getAudioData();
        return audioData;
    } catch (error: unknown) {
        if (error instanceof Error) {
            const message = error.message;

            if (
                message.includes("Cannot read properties of undefined") &&
                maxRetries > 0
            ) {
                console.log("[Raccoon-Wheel] Retrying to fetch audio data...");
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
                return fetchAudioData(retryDelay, maxRetries - 1);
            }
        } else {
            console.warn(`[Raccoon-Wheel] Error fetching audio data: ${error}`);
        }
        return null;
    }
}

// ============================================================================
// Video Sync Functions
// ============================================================================

/**
 * Updates video playback speed dynamically based on current beat
 */
function updateVideoSpeed(): void {
    const mediaElement = document.getElementById(VIDEO_ELEMENT_ID);
    if (!mediaElement) {
        return;
    }

    // Only videos support playback rate
    if (!(mediaElement instanceof HTMLVideoElement)) {
        return;
    }

    if (!Spicetify.Player.isPlaying()) {
        // When paused, play very slowly
        mediaElement.playbackRate = 0.1;
        if (mediaElement.paused) {
            mediaElement.play();
        }
        return;
    }

    const currentProgress = Spicetify.Player.getProgress();
    const dynamicRate = getDynamicRate(currentProgress, globalAudioData);

    mediaElement.playbackRate = dynamicRate;

    if (mediaElement.paused) {
        mediaElement.play();
    }
}

/**
 * Synchronizes video playback timing with the music's beats
 */
async function syncTiming(startTime: number, progress: number): Promise<void> {
    const mediaElement = document.getElementById(VIDEO_ELEMENT_ID);
    if (mediaElement) {
        if (mediaElement instanceof HTMLVideoElement) {
            if (Spicetify.Player.isPlaying()) {
                const progressInSeconds = progress / 1000;

                // Update speed immediately
                const dynamicRate = getDynamicRate(progress, globalAudioData);
                mediaElement.playbackRate = dynamicRate;
                console.log(
                    `[Raccoon-Wheel] Sync timing - Rate: ${dynamicRate.toFixed(
                        2
                    )}x`
                );

                if (globalAudioData?.beats) {
                    const upcomingBeat = globalAudioData.beats.find(
                        (beat: Beat) => beat.start > progressInSeconds
                    );
                    if (upcomingBeat) {
                        const operationTime = performance.now() - startTime;
                        const delayUntilNextBeat = Math.max(
                            0,
                            (upcomingBeat.start - progressInSeconds) * 1000 -
                                operationTime
                        );

                        setTimeout(() => {
                            mediaElement.currentTime = 0;
                            mediaElement.play();
                        }, delayUntilNextBeat);
                    } else {
                        mediaElement.currentTime = 0;
                        mediaElement.play();
                    }
                    console.log(
                        "[Raccoon-Wheel] Resynchronized to nearest beat"
                    );
                } else {
                    console.log("[Raccoon-Wheel] No beat data, simple reset");
                    mediaElement.currentTime = 0;
                    mediaElement.play();
                }
            } else {
                // When paused, play very slowly instead of pausing completely
                mediaElement.playbackRate = 0.1;
                if (mediaElement.paused) {
                    mediaElement.play();
                }
            }
        }
    } else {
        createWebMVideo();
        console.error("[Raccoon-Wheel] Video element not found. Recreating...");
    }
}

// ============================================================================
// DOM Utilities
// ============================================================================

/**
 * Waits for a specific DOM element to appear before proceeding
 */
async function waitForElement(
    selector: string,
    maxAttempts = 50,
    interval = 100
): Promise<Element> {
    let attempts = 0;
    while (attempts < maxAttempts) {
        const element = document.querySelector(selector);
        if (element) {
            return element;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
        attempts++;
    }
    throw new Error(
        `Element ${selector} not found after ${maxAttempts} attempts.`
    );
}

// ============================================================================
// Video Creation
// ============================================================================

/**
 * Creates the WebM video element and sets initial BPM and play state
 */
async function createWebMVideo(): Promise<void> {
    if (isCreatingVideo) return;
    isCreatingVideo = true;

    try {
        let mainCoverArtVideoSize = Number(
            settings.getFieldValue("raccoonwheel-webm-position-left-size")
        );
        if (!mainCoverArtVideoSize) {
            mainCoverArtVideoSize = DEFAULT_VIDEO_SIZE;
        }

        const selectedPosition = settings.getFieldValue(
            "raccoonwheel-webm-position"
        );
        const isBottomPosition = selectedPosition === "Bottom";

        const targetElementSelector = isBottomPosition
            ? SELECTORS.BOTTOM_PLAYER
            : SELECTORS.MAIN_COVER_ART;

        let elementStyles;
        if (isBottomPosition) {
            elementStyles = STYLES.BOTTOM_PLAYER;
        } else {
            // For main position, get the container dimensions
            const mainCoverArtContainer = document.querySelector(
                SELECTORS.MAIN_COVER_ART_CONTAINER
            );
            const containerWidth = mainCoverArtContainer
                ? mainCoverArtContainer.clientWidth
                : null;
            const containerHeight = mainCoverArtContainer
                ? mainCoverArtContainer.clientHeight
                : null;

            console.log(
                `[Raccoon-Wheel] Container dimensions: ${containerWidth}x${containerHeight}`
            );

            // Use container dimensions if available
            const widthStyle = containerWidth
                ? `${containerWidth}px`
                : undefined;
            const heightStyle = containerHeight
                ? `${containerHeight}px`
                : undefined;

            elementStyles = STYLES.getMainCoverArt(
                mainCoverArtVideoSize,
                widthStyle,
                heightStyle
            );
        }

        const targetElement = await waitForElement(targetElementSelector);

        // Get video URL based on settings
        const videoSelection = settings.getFieldValue(
            "raccoonwheel-webm-selection"
        );
        let videoURL = "";

        if (videoSelection === "Custom") {
            videoURL = String(settings.getFieldValue("raccoonwheel-webm-link"));
            if (!videoURL) {
                videoURL = DEFAULT_VIDEO_URL;
            }
        } else {
            // Use preset video
            const presetKey = videoSelection || "Husky";
            videoURL =
                VIDEO_OPTIONS[presetKey as keyof typeof VIDEO_OPTIONS] ||
                DEFAULT_VIDEO_URL;
        }

        console.log(
            `[Raccoon-Wheel] Selected video: ${
                videoSelection || "Husky"
            } - URL: ${videoURL}`
        );

        const isGif = videoURL.toLowerCase().endsWith(".gif");

        // Create appropriate element - GIFs need img tag, videos use video tag
        let mediaElement: HTMLElement;
        if (isGif) {
            mediaElement = document.createElement("img");
            console.log(
                `[Raccoon-Wheel] Creating IMG element for GIF at position: ${selectedPosition} (no dynamic speed support for GIFs)`
            );
        } else {
            const videoEl = document.createElement("video");
            videoEl.setAttribute("loop", "true");
            videoEl.setAttribute("autoplay", "true");
            videoEl.setAttribute("muted", "true");
            mediaElement = videoEl;
            console.log(
                `[Raccoon-Wheel] Creating VIDEO element at position: ${selectedPosition}`
            );
        }

        (mediaElement as HTMLMediaElement).src = videoURL;
        mediaElement.id = VIDEO_ELEMENT_ID;
        mediaElement.style.cssText = elementStyles;

        globalAudioData = await fetchAudioData();
        console.log(
            `[Raccoon-Wheel] Audio data loaded - Beats: ${
                globalAudioData?.beats?.length || 0
            }`
        );

        // Only set playback rate for video elements (GIFs use img tag and don't support playbackRate)
        if (mediaElement instanceof HTMLVideoElement) {
            const initialRate = await getPlaybackRate(globalAudioData);
            mediaElement.playbackRate = initialRate;
            console.log(
                `[Raccoon-Wheel] Initial video playback rate: ${initialRate.toFixed(
                    2
                )}x`
            );
        } else {
            console.log(
                `[Raccoon-Wheel] GIF element (img tag) - dynamic speed not supported`
            );
        }

        // Remove any existing video element to avoid duplicates
        // Check this AFTER waiting/fetching so we don't remove it while fetching
        const existingVideo = document.getElementById(VIDEO_ELEMENT_ID);
        if (existingVideo) {
            existingVideo.remove();
        }

        // Insert the video element into the target element in the DOM
        if (isBottomPosition) {
            const firstChild = targetElement.firstChild as Element | null;
            if (firstChild) {
                targetElement.insertBefore(mediaElement, firstChild);
            }
        } else {
            targetElement.insertBefore(mediaElement, targetElement.firstChild);
        }

        // Control playback based on whether Spotify is currently playing music
        if (mediaElement instanceof HTMLVideoElement) {
            if (Spicetify.Player.isPlaying()) {
                mediaElement.play();
            } else {
                mediaElement.pause();
            }
        }
        // GIFs (img elements) auto-play and don't need play/pause control
    } catch (error) {
        console.error(
            "[Raccoon-Wheel] Could not create raccoon-wheel video element: ",
            error
        );
    } finally {
        isCreatingVideo = false;
    }
}

// ============================================================================
// BPM Calculation
// ============================================================================

/**
 * Gets a better BPM based on track audio features
 */
async function getBetterBPM(currentBPM: number): Promise<number> {
    let betterBPM = currentBPM;
    try {
        const currentSongDataUri = Spicetify.Player.data?.item?.uri;
        if (!currentSongDataUri) {
            return currentBPM;
        }
        const uriFinal = currentSongDataUri.split(":")[2];
        const res: AudioFeatures = await Spicetify.CosmosAsync.get(
            "https://api.spotify.com/v1/audio-features/" + uriFinal
        );
        const danceability = Math.round(100 * res.danceability);
        const energy = Math.round(100 * res.energy);
        betterBPM = calculateBetterBPM(danceability, energy, currentBPM);
    } catch (error) {
        console.error("[Raccoon-Wheel] Could not get audio features: ", error);
    }
    return betterBPM;
}

/**
 * Calculates a better BPM based on danceability, energy, and current BPM
 */
function calculateBetterBPM(
    danceability: number,
    energy: number,
    currentBPM: number
): number {
    let danceabilityWeight = 0.9;
    let energyWeight = 0.6;
    let bpmWeight = 0.6;
    const energyThreshold = 0.5;
    const danceabilityThreshold = 0.5;
    const maxBPM = 100;
    const bpmThreshold = 0.8; // 80 bpm

    const normalizedBPM = currentBPM / 100;
    const normalizedDanceability = danceability / 100;
    const normalizedEnergy = energy / 100;

    if (normalizedDanceability < danceabilityThreshold) {
        danceabilityWeight *= normalizedDanceability;
    }

    if (normalizedEnergy < energyThreshold) {
        energyWeight *= normalizedEnergy;
    }

    // Increase bpm weight if the song is slow
    if (normalizedBPM < bpmThreshold) {
        bpmWeight = 0.9;
    }

    const weightedAverage =
        (normalizedDanceability * danceabilityWeight +
            normalizedEnergy * energyWeight +
            normalizedBPM * bpmWeight) /
        (1 - danceabilityWeight + 1 - energyWeight + bpmWeight);
    let betterBPM = weightedAverage * maxBPM;

    console.log({
        danceabilityWeight,
        energyWeight,
        currentBPM,
        weightedAverage,
        betterBPM,
        bpmWeight,
    });

    const betterBPMForFasterSongs =
        settings.getFieldValue("raccoonwheel-webm-bpm-method-faster-songs") !==
        "Track BPM";
    if (betterBPM > currentBPM) {
        if (betterBPMForFasterSongs) {
            betterBPM = (betterBPM + currentBPM) / 2;
        } else {
            betterBPM = currentBPM;
        }
    }

    if (betterBPM < currentBPM) {
        betterBPM = Math.max(betterBPM, 70);
    }

    return betterBPM;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Initializes and manages the Spicetify app extension
 */
async function main(): Promise<void> {
    // Continuously check until the Spicetify Player and audio data APIs are available
    while (!Spicetify?.Player?.addEventListener || !Spicetify?.getAudioData) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log("[Raccoon-Wheel] Extension loaded.");

    // Create Settings UI
    settings.addDropDown(
        "raccoonwheel-webm-selection",
        "Select Video",
        Object.keys(VIDEO_OPTIONS),
        0
    );
    settings.addInput("raccoonwheel-webm-link", "Custom webM video URL", "");
    settings.addInput(
        "raccoonwheel-webm-bpm",
        "Custom default BPM of webM video",
        ""
    );
    settings.addDropDown(
        "raccoonwheel-webm-position",
        "Position where webM video should be rendered",
        ["Bottom", "Main"],
        1
    );
    settings.addDropDown(
        "raccoonwheel-webm-bpm-method",
        "Method to calculate better BPM for slower songs",
        ["Track BPM", "Danceability, Energy and Track BPM"],
        1
    );
    settings.addDropDown(
        "raccoonwheel-webm-bpm-method-faster-songs",
        "Method to calculate better BPM for faster songs",
        ["Track BPM", "Danceability, Energy and Track BPM"],
        1
    );
    settings.addButton(
        "raccoonwheel-reload",
        "Reload custom values",
        "Save and reload",
        () => {
            createWebMVideo();
        }
    );
    settings.pushSettings();

    // Create initial WebM video
    createWebMVideo();

    let lastProgress = 0;
    let speedUpdateInterval: number | null = null;

    // Start continuous speed update loop
    function startSpeedUpdateLoop(): void {
        if (speedUpdateInterval) {
            clearInterval(speedUpdateInterval);
        }
        // Update speed every 50ms for smooth, dynamic changes
        speedUpdateInterval = window.setInterval(() => {
            updateVideoSpeed();
        }, 50);
    }

    startSpeedUpdateLoop();

    Spicetify.Player.addEventListener("onplaypause", async () => {
        const startTime = performance.now();
        const progress = Spicetify.Player.getProgress();
        lastProgress = progress;
        syncTiming(startTime, progress);
        updateVideoSpeed();
    });

    Spicetify.Player.addEventListener("onprogress", async () => {
        const currentTime = performance.now();
        const progress = Spicetify.Player.getProgress();

        // Check if a significant skip in progress has occurred
        if (Math.abs(progress - lastProgress) >= 500) {
            syncTiming(currentTime, progress);
        }
        lastProgress = progress;

        // Speed is now updated by the interval loop
    });

    Spicetify.Player.addEventListener("songchange", async () => {
        const startTime = performance.now();
        lastProgress = Spicetify.Player.getProgress();

        const mediaElement = document.getElementById(VIDEO_ELEMENT_ID);
        if (mediaElement) {
            globalAudioData = await fetchAudioData();
            console.log("[Raccoon-Wheel] Audio data fetched:", globalAudioData);

            if (mediaElement instanceof HTMLVideoElement) {
                if (
                    globalAudioData?.beats &&
                    globalAudioData.beats.length > 0
                ) {
                    const firstBeatStart = globalAudioData.beats[0].start;

                    // Set initial dynamic playback rate
                    const initialRate = getDynamicRate(0, globalAudioData);
                    mediaElement.playbackRate = initialRate;

                    const operationTime = performance.now() - startTime;
                    const delayUntilFirstBeat = Math.max(
                        0,
                        firstBeatStart * 1000 - operationTime
                    );

                    setTimeout(() => {
                        mediaElement.currentTime = 0;
                        mediaElement.play();
                    }, delayUntilFirstBeat);
                } else {
                    mediaElement.playbackRate = await getPlaybackRate(
                        globalAudioData
                    );
                    mediaElement.currentTime = 0;
                    mediaElement.play();
                }
            }

            // Restart speed update loop with new song data
            startSpeedUpdateLoop();
        } else {
            createWebMVideo();
            console.error(
                "[Raccoon-Wheel] Video element not found. Recreating..."
            );
        }
    });
}

export default main;
