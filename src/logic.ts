export interface Beat {
    start: number;
    duration: number;
    confidence: number;
}

export interface Section {
    start: number;
    duration: number;
    confidence: number;
    loudness: number;
    tempo: number;
    tempo_confidence: number;
    key: number;
    key_confidence: number;
    mode: number;
    mode_confidence: number;
    time_signature: number;
    time_signature_confidence: number;
}

export interface Segment {
    start: number;
    duration: number;
    confidence: number;
    loudness_start: number;
    loudness_max: number;
    loudness_max_time: number;
    loudness_end: number;
    pitches: number[];
    timbre: number[];
}

export interface Track {
    tempo: number;
    loudness: number;
    duration: number;
}

export interface AudioData {
    track?: Track;
    beats?: Beat[];
    sections?: Section[];
    segments?: Segment[];
}

export interface AudioFeatures {
    danceability: number;
    energy: number;
}

export const DEFAULT_VIDEO_BPM = 130;

/**
 * Calculates dynamic playback rate based on current beat intensity
 */
export function calculateDynamicPlaybackRate(
    currentProgress: number, // in milliseconds
    audioData: AudioData | null,
    videoDefaultBPM: number = DEFAULT_VIDEO_BPM
): number {
    if (!audioData?.beats || audioData.beats.length === 0) {
        // console.log("[Raccoon-Wheel] No beats available, using default rate");
        return 1;
    }

    const progressInSeconds = currentProgress / 1000;

    // Find current and next beat
    let currentBeatIndex = -1;
    for (let i = 0; i < audioData.beats.length; i++) {
        if (audioData.beats[i].start <= progressInSeconds) {
            currentBeatIndex = i;
        } else {
            break;
        }
    }

    if (currentBeatIndex === -1) {
        return 0.3; // Very slow before first beat
    }

    const currentBeat = audioData.beats[currentBeatIndex];
    const nextBeat = audioData.beats[currentBeatIndex + 1];

    if (!nextBeat) {
        // Last beat - use current beat confidence
        return 0.5 + currentBeat.confidence * 1.5;
    }

    // Calculate instantaneous tempo based on beat duration
    const beatDuration = nextBeat.start - currentBeat.start;
    const instantBPM = 60 / beatDuration;

    // Base speed on instantaneous BPM
    let rateRatio = instantBPM / videoDefaultBPM;

    // Compensation for low BPM high energy tracks (e.g. 100BPM energetic tracks)
    // If the ratio is low (< 0.8) but confidence is high (> 0.5), we boost it significantly
    if (rateRatio < 0.8 && currentBeat.confidence > 0.5) {
        rateRatio = rateRatio * 1.25; // Boost by 25%
    }

    let playbackRate = rateRatio;

    // Apply confidence as intensity multiplier (0.0 to 1.0)
    // Increased range: 0.4 to 1.6 (was 0.6 to 1.4)
    // High confidence = more intense = faster
    const confidenceMultiplier = 0.4 + currentBeat.confidence * 1.2;
    playbackRate *= confidenceMultiplier;

    // Apply loudness energy modulation (Sections & Segments)
    let loudnessMultiplier = 1.0;

    if (audioData.track) {
        // 1. Broad Section Energy (Verse vs Chorus)
        if (audioData.sections) {
            const currentSection = audioData.sections.find(
                (section) =>
                    progressInSeconds >= section.start &&
                    progressInSeconds < section.start + section.duration
            );

            if (currentSection) {
                // Compare section average loudness to track average loudness
                const sectionLoudnessDiff =
                    currentSection.loudness - audioData.track.loudness;

                // For every 1dB louder than average, increase speed
                // Asymmetric: Boost aggressively (up to +0.6), but punish gently (max -0.15)
                // This prevents the video from stalling during verses/intros
                loudnessMultiplier += Math.max(
                    -0.15,
                    Math.min(0.6, sectionLoudnessDiff * 0.15)
                );
            }
        }

        // 2. Instant Segment Energy (Percussion/Transients)
        // Uses segments from example.json structure for micro-dynamics
        if (audioData.segments) {
            const currentSegment = audioData.segments.find(
                (segment) =>
                    progressInSeconds >= segment.start &&
                    progressInSeconds < segment.start + segment.duration
            );

            if (currentSegment) {
                // Compare instant peak loudness to track average
                // Segments are very short (~200ms), capturing drum hits and transients
                const segmentLoudnessDiff =
                    currentSegment.loudness_max - audioData.track.loudness;

                // Apply a modulation for segments to add "texture" to the speed
                // Asymmetric: Punchy hits (up to +0.4), minimal drag on soft notes (max -0.1)
                loudnessMultiplier += Math.max(
                    -0.1,
                    Math.min(0.4, segmentLoudnessDiff * 0.12)
                );
            }
        }
    }

    // Apply the combined loudness multiplier
    // Safety floor: Never drop global multiplier below 0.65 due to loudness alone
    loudnessMultiplier = Math.max(0.65, loudnessMultiplier);
    playbackRate *= loudnessMultiplier;

    // Position within the beat for micro-variations
    const positionInBeat =
        (progressInSeconds - currentBeat.start) / beatDuration;

    // Create a slight speed boost at the start of each beat (attack)
    // and slight slowdown in the middle for dynamic feel
    let beatPhaseMultiplier = 1.0;
    if (positionInBeat < 0.1) {
        // Attack: speed up at beat start
        beatPhaseMultiplier = 1.2;
    } else if (positionInBeat < 0.4) {
        // Early decay
        beatPhaseMultiplier = 1.1;
    } else if (positionInBeat < 0.7) {
        // Mid beat: slight slowdown
        beatPhaseMultiplier = 0.95;
    } else {
        // Preparing for next beat
        beatPhaseMultiplier = 1.0;
    }

    playbackRate *= beatPhaseMultiplier;

    // Clamp to reasonable range
    playbackRate = Math.max(0.3, Math.min(3.0, playbackRate));

    return playbackRate;
}
