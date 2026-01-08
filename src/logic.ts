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

// ============================================================================
// TRAP NATION STYLE ALGORITHM
// ============================================================================
// This algorithm creates a visual "bounce" effect like Trap Nation music videos
// Key characteristics:
// 1. Strong pulse on every beat with smooth easing
// 2. Energy-based base speed (drops are faster, intros are slower)
// 3. Bass reactivity using timbre analysis
// 4. Build-up detection for pre-drop acceleration
// 5. Smooth sinusoidal motion within each beat
// ============================================================================

/**
 * Easing function for smooth beat pulse (ease-out cubic)
 */
function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Easing function for attack (ease-in quad)
 */
function easeInQuad(t: number): number {
    return t * t;
}

/**
 * Sinusoidal pulse for smooth bouncing motion
 */
function sinePulse(t: number): number {
    // Creates a smooth up-down motion within the beat
    // t=0: start of beat, t=1: end of beat
    return Math.sin(t * Math.PI);
}

/**
 * Normalize loudness from dB to 0-1 range
 * Typical loudness range: -60dB to 0dB
 */
function normalizeLoudness(loudnessDb: number, minDb: number = -60, maxDb: number = 0): number {
    const normalized = (loudnessDb - minDb) / (maxDb - minDb);
    return Math.max(0, Math.min(1, normalized));
}

/**
 * Get bass energy from timbre (first coefficient represents brightness/bass)
 */
function getBassEnergy(segment: Segment): number {
    if (!segment.timbre || segment.timbre.length === 0) return 0.5;
    // timbre[0] is overall loudness, timbre[1] is brightness (negative = bassy)
    // We want bassy sounds to have higher energy
    const brightness = segment.timbre[1] || 0;
    // Invert: more negative = more bass = higher value
    // Normalize from typical range (-100 to 100) to (0 to 1)
    const bassiness = Math.max(0, Math.min(1, (-brightness + 100) / 200));
    return bassiness;
}

/**
 * Detect if we're in a build-up section (rising energy before drop)
 */
function detectBuildUp(
    progressInSeconds: number,
    sections: Section[],
    currentSectionIndex: number
): { isBuildUp: boolean; buildUpProgress: number } {
    if (currentSectionIndex < 0 || currentSectionIndex >= sections.length - 1) {
        return { isBuildUp: false, buildUpProgress: 0 };
    }

    const currentSection = sections[currentSectionIndex];
    const nextSection = sections[currentSectionIndex + 1];

    // Check if next section is significantly louder (drop incoming)
    const loudnessDiff = nextSection.loudness - currentSection.loudness;
    const isBuildUp = loudnessDiff > 1.5; // Next section is >1.5dB louder

    if (!isBuildUp) {
        return { isBuildUp: false, buildUpProgress: 0 };
    }

    // Calculate how far into the build-up we are (last 8 seconds before drop)
    const buildUpWindow = 8; // seconds
    const timeUntilNextSection = (currentSection.start + currentSection.duration) - progressInSeconds;
    
    if (timeUntilNextSection > buildUpWindow) {
        return { isBuildUp: false, buildUpProgress: 0 };
    }

    const buildUpProgress = 1 - (timeUntilNextSection / buildUpWindow);
    return { isBuildUp: true, buildUpProgress: Math.max(0, Math.min(1, buildUpProgress)) };
}

/**
 * Find section by time with index
 */
function findSectionWithIndex(
    progressInSeconds: number,
    sections: Section[]
): { section: Section | null; index: number } {
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (progressInSeconds >= section.start && progressInSeconds < section.start + section.duration) {
            return { section, index: i };
        }
    }
    return { section: null, index: -1 };
}

/**
 * Calculate section energy level (0-1) based on loudness relative to track
 */
function getSectionEnergy(section: Section, trackLoudness: number): number {
    // Section loudness compared to track average
    const loudnessDiff = section.loudness - trackLoudness;
    // Map from typical range (-5 to +3) to (0 to 1)
    const energy = (loudnessDiff + 5) / 8;
    return Math.max(0, Math.min(1, energy));
}

/**
 * Calculates dynamic playback rate - Trap Nation Style
 * Creates smooth bouncing visuals that react to beat and energy
 */
export function calculateDynamicPlaybackRate(
    currentProgress: number, // in milliseconds
    audioData: AudioData | null,
    videoDefaultBPM: number = DEFAULT_VIDEO_BPM
): number {
    if (!audioData?.beats || audioData.beats.length === 0) {
        return 1;
    }

    const progressInSeconds = currentProgress / 1000;
    const trackLoudness = audioData.track?.loudness ?? -10;
    const trackTempo = audioData.track?.tempo ?? 120;

    // ========================================================================
    // STEP 1: Find current beat position
    // ========================================================================
    let currentBeatIndex = -1;
    for (let i = 0; i < audioData.beats.length; i++) {
        if (audioData.beats[i].start <= progressInSeconds) {
            currentBeatIndex = i;
        } else {
            break;
        }
    }

    // Before first beat - slow intro
    if (currentBeatIndex === -1) {
        return 0.4;
    }

    const currentBeat = audioData.beats[currentBeatIndex];
    const nextBeat = audioData.beats[currentBeatIndex + 1];

    // After last beat - fade out slowly
    if (!nextBeat) {
        return 0.5 + currentBeat.confidence * 0.3;
    }

    // ========================================================================
    // STEP 2: Calculate beat timing
    // ========================================================================
    const beatDuration = nextBeat.start - currentBeat.start;
    const positionInBeat = (progressInSeconds - currentBeat.start) / beatDuration;
    const instantBPM = 60 / beatDuration;

    // ========================================================================
    // STEP 3: BASE RATE from BPM matching
    // ========================================================================
    // Scale video to match music tempo
    const tempoRatio = instantBPM / videoDefaultBPM;
    // Clamp tempo ratio to prevent extreme values
    const clampedTempoRatio = Math.max(0.6, Math.min(1.4, tempoRatio));
    let baseRate = clampedTempoRatio;

    // ========================================================================
    // TEMPO INTENSITY FACTOR
    // ========================================================================
    // Slow songs (ballads ~70-90 BPM) should have gentler dynamics
    // Fast songs (EDM ~120-140 BPM) should have dramatic dynamics
    // Maps: 70 BPM -> 0.3, 100 BPM -> 0.6, 130+ BPM -> 1.0
    const tempoIntensity = Math.max(0.3, Math.min(1.0, (trackTempo - 70) / 60));

    // ========================================================================
    // STEP 4: SECTION ENERGY - Drops vs Verses
    // ========================================================================
    let sectionEnergy = 0.5; // Default mid-energy
    let buildUpMultiplier = 1.0;

    if (audioData.sections && audioData.sections.length > 0) {
        const { section: currentSection, index: sectionIndex } = findSectionWithIndex(
            progressInSeconds,
            audioData.sections
        );

        if (currentSection) {
            sectionEnergy = getSectionEnergy(currentSection, trackLoudness);

            // Detect build-up to next section
            const { isBuildUp, buildUpProgress } = detectBuildUp(
                progressInSeconds,
                audioData.sections,
                sectionIndex
            );

            if (isBuildUp) {
                // Accelerate during build-up, scaled by tempo intensity
                // Fast songs: 1.0 -> 1.4, Slow songs: 1.0 -> 1.15
                buildUpMultiplier = 1.0 + buildUpProgress * 0.4 * tempoIntensity;
            }
        }
    }

    // Apply section energy: low energy sections = slower base, high = faster
    // Scale the range by tempo intensity:
    // - Fast songs (EDM): 0.5x to 1.5x range (full effect)
    // - Slow songs (ballads): 0.7x to 1.15x range (gentler effect)
    const sectionRangeMin = 0.5 + (1 - tempoIntensity) * 0.2; // 0.5 for fast, 0.7 for slow
    const sectionRangeMax = 1.0 * tempoIntensity; // 1.0 for fast, 0.45 for slow
    const sectionMultiplier = sectionRangeMin + sectionEnergy * sectionRangeMax;
    baseRate *= sectionMultiplier;
    baseRate *= buildUpMultiplier;

    // ========================================================================
    // STEP 5: BEAT PULSE - The signature "bounce"
    // ========================================================================
    // Trap Nation style: strong attack, smooth decay
    // Creates the iconic pulsing effect

    let beatPulse: number;
    const beatConfidence = currentBeat.confidence;
    
    // Scale pulse intensity by section energy AND tempo
    // Slow songs get gentler pulse even in loud sections
    // Fast songs: 0.3 in quiet, 1.0 in loud
    // Slow songs: 0.2 in quiet, 0.5 in loud
    const basePulseIntensity = 0.3 + sectionEnergy * 0.7;
    const pulseIntensity = basePulseIntensity * (0.4 + tempoIntensity * 0.6);

    if (positionInBeat < 0.15) {
        // ATTACK PHASE (0-15% of beat): Quick spike up
        const attackProgress = positionInBeat / 0.15;
        // Use confidence and section energy to modulate attack strength
        const attackStrength = (0.3 + beatConfidence * 0.5) * pulseIntensity;
        beatPulse = 1.0 + attackStrength * easeOutCubic(attackProgress);
    } else if (positionInBeat < 0.5) {
        // SUSTAIN/DECAY PHASE (15-50%): Hold then smooth decay
        const decayProgress = (positionInBeat - 0.15) / 0.35;
        const peakValue = (0.3 + beatConfidence * 0.5) * pulseIntensity;
        // Smooth decay using sine
        beatPulse = 1.0 + peakValue * (1 - easeInQuad(decayProgress));
    } else {
        // REST PHASE (50-100%): Subtle breathing motion
        const restProgress = (positionInBeat - 0.5) / 0.5;
        // Gentle sine wave for "breathing"
        const breathAmount = 0.1 * beatConfidence * pulseIntensity;
        beatPulse = 1.0 + breathAmount * sinePulse(restProgress);
    }

    // ========================================================================
    // STEP 6: SEGMENT REACTIVITY - Bass and transients
    // ========================================================================
    let segmentBoost = 1.0;

    if (audioData.segments && audioData.segments.length > 0) {
        // Find current segment
        const currentSegment = audioData.segments.find(
            (seg) =>
                progressInSeconds >= seg.start &&
                progressInSeconds < seg.start + seg.duration
        );

        if (currentSegment) {
            // React to loud transients (drum hits, bass drops)
            const segmentLoudness = normalizeLoudness(currentSegment.loudness_max);
            
            // React to bass (timbre analysis)
            const bassEnergy = getBassEnergy(currentSegment);

            // Combine: more bass + louder = bigger boost
            const combinedEnergy = (segmentLoudness * 0.6 + bassEnergy * 0.4);
            
            // Apply boost scaled by section energy AND tempo intensity
            // Fast loud sections: up to 1.4x boost
            // Slow loud sections: up to 1.15x boost
            const maxBoost = (0.15 + sectionEnergy * 0.25) * tempoIntensity;
            segmentBoost = 1.0 + combinedEnergy * maxBoost;
        }
    }

    // ========================================================================
    // STEP 7: COMBINE ALL FACTORS
    // ========================================================================
    let playbackRate = baseRate * beatPulse * segmentBoost;

    // ========================================================================
    // STEP 8: SMOOTHING - Prevent jarring transitions
    // ========================================================================
    // This is applied at runtime, but we ensure the output is reasonable
    
    // Final clamp: 0.4x to 2.5x speed range
    // Lower bound prevents near-stopped video
    // Upper bound prevents unnaturally fast playback
    playbackRate = Math.max(0.4, Math.min(2.5, playbackRate));

    return playbackRate;
}

/**
 * Advanced: Get detailed analysis for debugging
 */
export function getPlaybackAnalysis(
    currentProgress: number,
    audioData: AudioData | null,
    videoDefaultBPM: number = DEFAULT_VIDEO_BPM
): {
    rate: number;
    beatPhase: number;
    sectionEnergy: number;
    isBuildUp: boolean;
    bassEnergy: number;
} {
    const rate = calculateDynamicPlaybackRate(currentProgress, audioData, videoDefaultBPM);
    const progressInSeconds = currentProgress / 1000;

    let beatPhase = 0;
    let sectionEnergy = 0.5;
    let isBuildUp = false;
    let bassEnergy = 0.5;

    if (audioData?.beats) {
        let currentBeatIndex = -1;
        for (let i = 0; i < audioData.beats.length; i++) {
            if (audioData.beats[i].start <= progressInSeconds) {
                currentBeatIndex = i;
            } else {
                break;
            }
        }

        if (currentBeatIndex >= 0 && currentBeatIndex < audioData.beats.length - 1) {
            const currentBeat = audioData.beats[currentBeatIndex];
            const nextBeat = audioData.beats[currentBeatIndex + 1];
            const beatDuration = nextBeat.start - currentBeat.start;
            beatPhase = (progressInSeconds - currentBeat.start) / beatDuration;
        }
    }

    if (audioData?.sections) {
        const { section, index } = findSectionWithIndex(progressInSeconds, audioData.sections);
        if (section) {
            sectionEnergy = getSectionEnergy(section, audioData.track?.loudness ?? -10);
            const buildUpResult = detectBuildUp(progressInSeconds, audioData.sections, index);
            isBuildUp = buildUpResult.isBuildUp;
        }
    }

    if (audioData?.segments) {
        const currentSegment = audioData.segments.find(
            (seg) =>
                progressInSeconds >= seg.start &&
                progressInSeconds < seg.start + seg.duration
        );
        if (currentSegment) {
            bassEnergy = getBassEnergy(currentSegment);
        }
    }

    return { rate, beatPhase, sectionEnergy, isBuildUp, bassEnergy };
}
