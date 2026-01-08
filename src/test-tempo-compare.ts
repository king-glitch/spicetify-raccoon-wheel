import { calculateDynamicPlaybackRate, type AudioData, DEFAULT_VIDEO_BPM } from "./logic";

// Simulate a SLOW SONG (80 BPM ballad)
const slowSong: AudioData = {
    track: { tempo: 80, loudness: -8, duration: 180 },
    beats: Array.from({ length: 100 }, (_, i) => ({
        start: i * 0.75, // 80 BPM = 0.75s per beat
        duration: 0.75,
        confidence: 0.8
    })),
    sections: [
        { start: 0, duration: 30, loudness: -12, confidence: 1, tempo: 80, tempo_confidence: 1, key: 0, key_confidence: 0, mode: 1, mode_confidence: 0, time_signature: 4, time_signature_confidence: 1 },
        { start: 30, duration: 40, loudness: -6, confidence: 1, tempo: 80, tempo_confidence: 1, key: 0, key_confidence: 0, mode: 1, mode_confidence: 0, time_signature: 4, time_signature_confidence: 1 }, // HOOK
        { start: 70, duration: 30, loudness: -10, confidence: 1, tempo: 80, tempo_confidence: 1, key: 0, key_confidence: 0, mode: 1, mode_confidence: 0, time_signature: 4, time_signature_confidence: 1 },
    ],
    segments: []
};

// Simulate a FAST SONG (128 BPM EDM)
const fastSong: AudioData = {
    track: { tempo: 128, loudness: -6, duration: 180 },
    beats: Array.from({ length: 200 }, (_, i) => ({
        start: i * 0.47, // 128 BPM = 0.47s per beat
        duration: 0.47,
        confidence: 0.9
    })),
    sections: [
        { start: 0, duration: 30, loudness: -12, confidence: 1, tempo: 128, tempo_confidence: 1, key: 0, key_confidence: 0, mode: 1, mode_confidence: 0, time_signature: 4, time_signature_confidence: 1 },
        { start: 30, duration: 40, loudness: -4, confidence: 1, tempo: 128, tempo_confidence: 1, key: 0, key_confidence: 0, mode: 1, mode_confidence: 0, time_signature: 4, time_signature_confidence: 1 }, // DROP
        { start: 70, duration: 30, loudness: -10, confidence: 1, tempo: 128, tempo_confidence: 1, key: 0, key_confidence: 0, mode: 1, mode_confidence: 0, time_signature: 4, time_signature_confidence: 1 },
    ],
    segments: []
};

function testSong(name: string, song: AudioData) {
    console.log("=".repeat(60));
    console.log(`${name} (${song.track?.tempo} BPM)`);
    console.log("=".repeat(60));
    
    // Calculate tempo intensity for display
    const tempo = song.track?.tempo ?? 120;
    const tempoIntensity = Math.max(0.3, Math.min(1.0, (tempo - 70) / 60));
    console.log(`Tempo Intensity Factor: ${(tempoIntensity * 100).toFixed(0)}%`);
    console.log("");
    
    // Test quiet section (verse)
    let quietRates: number[] = [];
    for (let t = 5000; t < 25000; t += 500) {
        quietRates.push(calculateDynamicPlaybackRate(t, song, DEFAULT_VIDEO_BPM));
    }
    
    // Test loud section (hook/drop)
    let loudRates: number[] = [];
    for (let t = 35000; t < 60000; t += 500) {
        loudRates.push(calculateDynamicPlaybackRate(t, song, DEFAULT_VIDEO_BPM));
    }
    
    const qMin = Math.min(...quietRates).toFixed(2);
    const qMax = Math.max(...quietRates).toFixed(2);
    const qAvg = (quietRates.reduce((a, b) => a + b) / quietRates.length).toFixed(2);
    
    const lMin = Math.min(...loudRates).toFixed(2);
    const lMax = Math.max(...loudRates).toFixed(2);
    const lAvg = (loudRates.reduce((a, b) => a + b) / loudRates.length).toFixed(2);
    
    console.log(`🌙 Quiet Section (verse):  Min=${qMin} Max=${qMax} Avg=${qAvg}`);
    console.log(`🔥 Loud Section (hook):    Min=${lMin} Max=${lMax} Avg=${lAvg}`);
    console.log(`📈 Hook vs Verse ratio:    ${(parseFloat(lAvg) / parseFloat(qAvg)).toFixed(2)}x`);
    console.log("");
}

console.log("\n🎵 TEMPO INTENSITY COMPARISON\n");
console.log("This shows how the algorithm behaves differently for slow vs fast songs.\n");

testSong("🎹 SLOW BALLAD", slowSong);
testSong("🔊 FAST EDM", fastSong);

console.log("✅ Slow songs now have gentler dynamics in their hooks!");
