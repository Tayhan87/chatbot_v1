import sounddevice as sd
import queue
import json
import os
import sys
from vosk import Model, KaldiRecognizer

# === Configuration ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "vosk-model-small-en-us-0.15")
LOG_PATH = os.path.join(BASE_DIR, "transcript.txt")
STOP_FLAG_PATH = os.path.join(BASE_DIR, "stop.flag")
SAMPLERATE = 16000

q = queue.Queue()

def find_voicemeeter_b1_device():
    devices = sd.query_devices()
    for i, dev in enumerate(devices):
        name = dev["name"].lower()
        if "voicemeeter out b1" in name and dev["max_input_channels"] > 0:
            print(f"✅ Found Voicemeeter B1 device: {dev['name']} (ID: {i})")
            return i
    raise RuntimeError("❌ Voicemeeter B1 device not found. Make sure Voicemeeter is running and B1 is enabled.")


def audio_callback(indata, frames, time, status):
    if status:
        print(f"⚠️ Audio status: {status}")
    q.put(bytes(indata))

def should_stop():
    return os.path.exists(STOP_FLAG_PATH)

def start_transcription():
    if not os.path.exists(MODEL_PATH):
        print("❌ Model path not found.")
        return

    # Load Vosk model
    model = Model(MODEL_PATH)
    rec = KaldiRecognizer(model, SAMPLERATE)

    # Find the Voicemeeter B1 device
    device_id = find_voicemeeter_b1_device()

    try:
        with sd.RawInputStream(samplerate=SAMPLERATE,
                               blocksize=8000,
                               dtype="int16",
                               channels=1,
                               device=device_id,
                               callback=audio_callback):
            print("🎙️ Recording from Voicemeeter B1. Waiting for stop signal...\n")
            while not should_stop():
                data = q.get()

                if rec.AcceptWaveform(data):
                    result = json.loads(rec.Result())
                    final_text = result.get("text", "")
                    if final_text:
                        print("✅ Final:", final_text)
                        with open(LOG_PATH, "a", encoding="utf-8") as f:
                            f.write(final_text + "\n")
                else:
                    partial = json.loads(rec.PartialResult())
                    partial_text = partial.get("partial", "")
                    if partial_text:
                        print("🔹 Partial:", partial_text)

            print("🛑 Stop signal received. Cleaning up...")

            # Final flush
            final = json.loads(rec.FinalResult())
            final_text = final.get("text", "")
            if final_text:
                print("✅ Final Flush:", final_text)
                with open(LOG_PATH, "a", encoding="utf-8") as f:
                    f.write(final_text + "\n")

    except Exception as e:
        print(f"❌ Transcription error: {e}")

    finally:
        if os.path.exists(STOP_FLAG_PATH):
            os.remove(STOP_FLAG_PATH)
            print("🛑 Transcription stopped and cleaned up.")

if __name__ == "__main__":
    start_transcription()
