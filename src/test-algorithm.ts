import { calculateDynamicPlaybackRate, type AudioData, DEFAULT_VIDEO_BPM } from "./logic";
import exampleData from "./example.json";

// Type assertion since JSON import might be loosely typed
const audioData: AudioData = exampleData as unknown as AudioData;

console.log("Analyzing Audio Data...");
console.log(`Track Duration: ${audioData.track?.duration}s`);
console.log(`Track BPM: ${audioData.track?.tempo}`);
console.log(`Track Loudness: ${audioData.track?.loudness}`);
console.log("----------------------------------------------------------------");
console.log("Time(s) | Rate  | InstBPM | Conf | LoudMult | PhaseBoost");
console.log("----------------------------------------------------------------");

function testRange(startSec: number, endSec: number, stepMs: number = 100) {
    for (let t = startSec * 1000; t < endSec * 1000; t += stepMs) {
        const rate = calculateDynamicPlaybackRate(t, audioData, DEFAULT_VIDEO_BPM);
        
        // We act like we are "inside" the function to get debug values, 
        // but since we only get the result, we have to infer some things or 
        // just trust the result. 
        // Actually, to debug effectively, I might want to log the "components" 
        // but the function only returns the final rate.
        // For now, let's see the final rate dynamics.
        
        const progressInSeconds = t / 1000;
        let currentBeatIndex = -1;
        if (audioData.beats) {
             for (let i = 0; i < audioData.beats.length; i++) {
                if (audioData.beats[i].start <= progressInSeconds) {
                    currentBeatIndex = i;
                } else {
                    break;
                }
            }
        }
        
        const currentBeat = audioData.beats ? audioData.beats[currentBeatIndex] : null;
        const nextBeat = audioData.beats ? audioData.beats[currentBeatIndex + 1] : null;
        
        let instantBPM = 0;
        if(currentBeat && nextBeat) {
             const beatDuration = nextBeat.start - currentBeat.start;
             instantBPM = 60 / beatDuration;
        }

        console.log(
            `${(t/1000).toFixed(1).padEnd(7)} | ` +
            `${rate.toFixed(2).padEnd(5)} | ` +
            `${instantBPM.toFixed(1).padEnd(7)} | ` +
            `${currentBeat?.confidence.toFixed(2).padEnd(4) || "0.00"} | ` +
            // We can't see internal LoudnessMult without modifying the function to return it.
            // But checking the rate change is enough for now.
            `...` 
        );
    }
}

console.log("\n--- TEST: Intro (0s - 10s) ---");
testRange(0, 10, 200);

console.log("\n--- TEST: Drop/Chorus (40s - 50s) ---");
testRange(40, 50, 200);

console.log("\n--- TEST: Later (100s - 110s) ---");
testRange(100, 110, 200);
