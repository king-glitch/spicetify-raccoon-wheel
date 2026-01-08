import { calculateDynamicPlaybackRate, getPlaybackAnalysis, type AudioData, DEFAULT_VIDEO_BPM } from "./logic";
import exampleData from "./example.json";

// Type assertion since JSON import might be loosely typed
const audioData: AudioData = exampleData as unknown as AudioData;

const trackDuration = audioData.track?.duration ?? 180;

console.log("=".repeat(80));
console.log("TRAP NATION STYLE PLAYBACK ALGORITHM - Full Song Analysis");
console.log("=".repeat(80));
console.log(`Track Duration: ${trackDuration.toFixed(1)}s`);
console.log(`Track BPM: ${audioData.track?.tempo}`);
console.log(`Track Loudness: ${audioData.track?.loudness}dB`);
console.log(`Sections: ${audioData.sections?.length}`);
console.log(`Beats: ${audioData.beats?.length}`);
console.log(`Segments: ${audioData.segments?.length}`);
console.log("=".repeat(80));

// Print section breakdown
console.log("\n📊 SECTION BREAKDOWN:");
console.log("-".repeat(80));
if (audioData.sections) {
    audioData.sections.forEach((section, i) => {
        const loudnessDiff = section.loudness - (audioData.track?.loudness ?? 0);
        const energyLevel = loudnessDiff > 1 ? "🔥 HIGH" : loudnessDiff < -1 ? "🌙 LOW" : "⚡ MID";
        console.log(
            `Section ${(i + 1).toString().padStart(2)}: ` +
            `${section.start.toFixed(1).padStart(6)}s - ${(section.start + section.duration).toFixed(1).padStart(6)}s | ` +
            `Loudness: ${section.loudness.toFixed(1).padStart(5)}dB (${loudnessDiff > 0 ? '+' : ''}${loudnessDiff.toFixed(1).padStart(5)}) | ` +
            `Tempo: ${section.tempo.toFixed(0).padStart(3)} | ` +
            `${energyLevel}`
        );
    });
}

function visualizeRate(rate: number): string {
    const normalized = Math.min(2.5, Math.max(0.4, rate));
    const barLength = Math.round((normalized - 0.4) / 2.1 * 20);
    const bar = "█".repeat(barLength) + "░".repeat(20 - barLength);
    return bar;
}

function analyzeSection(startSec: number, endSec: number, stepMs: number = 500): {
    min: number; max: number; avg: number; samples: number;
} {
    let minRate = Infinity;
    let maxRate = -Infinity;
    let totalRate = 0;
    let count = 0;

    for (let t = startSec * 1000; t < endSec * 1000; t += stepMs) {
        const rate = calculateDynamicPlaybackRate(t, audioData, DEFAULT_VIDEO_BPM);
        minRate = Math.min(minRate, rate);
        maxRate = Math.max(maxRate, rate);
        totalRate += rate;
        count++;
    }

    return { min: minRate, max: maxRate, avg: totalRate / count, samples: count };
}

// Full song analysis - every 5 seconds
console.log("\n" + "=".repeat(80));
console.log("FULL SONG OVERVIEW (sampled every 5 seconds)");
console.log("=".repeat(80));
console.log("Time Range  | Min  | Max  | Avg  | Energy Graph");
console.log("-".repeat(80));

for (let t = 0; t < trackDuration; t += 5) {
    const endT = Math.min(t + 5, trackDuration);
    const stats = analyzeSection(t, endT, 200);
    
    const timeRange = `${t.toString().padStart(3)}s-${endT.toFixed(0).padStart(3)}s`;
    const avgBar = visualizeRate(stats.avg);
    
    console.log(
        `${timeRange} | ` +
        `${stats.min.toFixed(2)} | ` +
        `${stats.max.toFixed(2)} | ` +
        `${stats.avg.toFixed(2)} | ` +
        `${avgBar}`
    );
}

// Detailed analysis of key moments
console.log("\n" + "=".repeat(80));
console.log("DETAILED ANALYSIS OF KEY MOMENTS");
console.log("=".repeat(80));

function testRangeDetailed(startSec: number, endSec: number, stepMs: number, label: string) {
    console.log(`\n--- ${label} (${startSec}s - ${endSec}s) ---`);
    console.log("Time(s) | Rate  | BeatPhase | SecEnergy | BuildUp | Visual");
    console.log("-".repeat(70));
    
    let minRate = Infinity;
    let maxRate = -Infinity;
    let avgRate = 0;
    let count = 0;

    for (let t = startSec * 1000; t < endSec * 1000; t += stepMs) {
        const analysis = getPlaybackAnalysis(t, audioData, DEFAULT_VIDEO_BPM);
        
        minRate = Math.min(minRate, analysis.rate);
        maxRate = Math.max(maxRate, analysis.rate);
        avgRate += analysis.rate;
        count++;

        const progressInSeconds = t / 1000;
        const beatPhaseStr = (analysis.beatPhase * 100).toFixed(0).padStart(3) + "%";
        const sectionEnergyStr = (analysis.sectionEnergy * 100).toFixed(0).padStart(3) + "%";
        const buildUpStr = analysis.isBuildUp ? "🚀" : "  ";
        const visual = visualizeRate(analysis.rate);

        console.log(
            `${progressInSeconds.toFixed(1).padStart(7)} | ` +
            `${analysis.rate.toFixed(2).padStart(5)} | ` +
            `${beatPhaseStr.padStart(9)} | ` +
            `${sectionEnergyStr.padStart(9)} | ` +
            `${buildUpStr.padStart(5)} | ` +
            `${visual}`
        );
    }

    avgRate /= count;
    console.log(`\n  📈 Stats: Min=${minRate.toFixed(2)} | Max=${maxRate.toFixed(2)} | Avg=${avgRate.toFixed(2)}`);
}

// Analyze sections based on song structure
if (audioData.sections && audioData.sections.length > 0) {
    console.log("\nAnalyzing each section transition and key moments...\n");
    
    // First section (intro)
    const firstSection = audioData.sections[0];
    testRangeDetailed(firstSection.start, Math.min(firstSection.start + 10, firstSection.start + firstSection.duration), 300, "🌅 INTRO");
    
    // Find highest energy section
    let highestEnergyIdx = 0;
    let highestEnergy = -Infinity;
    audioData.sections.forEach((section, i) => {
        if (section.loudness > highestEnergy) {
            highestEnergy = section.loudness;
            highestEnergyIdx = i;
        }
    });
    
    const dropSection = audioData.sections[highestEnergyIdx];
    testRangeDetailed(dropSection.start, Math.min(dropSection.start + 10, dropSection.start + dropSection.duration), 300, "🔥 DROP/CHORUS (highest energy)");
    
    // Pre-drop buildup (8 seconds before drop)
    if (highestEnergyIdx > 0) {
        const preDropStart = Math.max(0, dropSection.start - 8);
        testRangeDetailed(preDropStart, dropSection.start + 2, 300, "🚀 BUILD-UP to DROP");
    }
    
    // Last section (outro)
    const lastSection = audioData.sections[audioData.sections.length - 1];
    testRangeDetailed(lastSection.start, Math.min(lastSection.start + 10, trackDuration), 300, "🌙 OUTRO");
}

// Beat pulse visualization
console.log("\n" + "=".repeat(80));
console.log("BEAT PULSE SHAPE - Single beat analysis");
console.log("=".repeat(80));

// Find a beat in the drop section
if (audioData.beats && audioData.sections) {
    let highestEnergyIdx = 0;
    let highestEnergy = -Infinity;
    audioData.sections.forEach((section, i) => {
        if (section.loudness > highestEnergy) {
            highestEnergy = section.loudness;
            highestEnergyIdx = i;
        }
    });
    
    const dropSection = audioData.sections[highestEnergyIdx];
    const testBeatStart = dropSection.start + 2;
    
    const testBeat = audioData.beats.find(b => b.start >= testBeatStart);
    if (testBeat) {
        const beatIdx = audioData.beats.indexOf(testBeat);
        const nextBeat = audioData.beats[beatIdx + 1];
        if (nextBeat) {
            const beatDuration = nextBeat.start - testBeat.start;
            const bpm = 60 / beatDuration;
            console.log(`\nBeat at ${testBeat.start.toFixed(3)}s | Duration: ${(beatDuration * 1000).toFixed(0)}ms | ~${bpm.toFixed(0)} BPM | Confidence: ${testBeat.confidence.toFixed(2)}`);
            console.log("-".repeat(60));
            
            for (let phase = 0; phase <= 1; phase += 0.05) {
                const t = (testBeat.start + beatDuration * phase) * 1000;
                const rate = calculateDynamicPlaybackRate(t, audioData, DEFAULT_VIDEO_BPM);
                const phaseLabel = phase < 0.15 ? "ATTACK" : phase < 0.5 ? "DECAY " : "REST  ";
                const visual = visualizeRate(rate);
                console.log(
                    `Phase ${(phase * 100).toFixed(0).padStart(3)}% [${phaseLabel}] | ` +
                    `Rate: ${rate.toFixed(2)} | ${visual}`
                );
            }
        }
    }
}

// Summary statistics
console.log("\n" + "=".repeat(80));
console.log("SUMMARY STATISTICS");
console.log("=".repeat(80));

const fullSongStats = analyzeSection(0, trackDuration, 100);
console.log(`\n📊 Full Song Analysis (${fullSongStats.samples} samples):`);
console.log(`   Minimum Rate: ${fullSongStats.min.toFixed(3)}`);
console.log(`   Maximum Rate: ${fullSongStats.max.toFixed(3)}`);
console.log(`   Average Rate: ${fullSongStats.avg.toFixed(3)}`);
console.log(`   Dynamic Range: ${(fullSongStats.max - fullSongStats.min).toFixed(3)} (${((fullSongStats.max / fullSongStats.min - 1) * 100).toFixed(0)}% variation)`);

console.log("\n✅ Full song algorithm test complete!");
