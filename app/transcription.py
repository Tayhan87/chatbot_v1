import sounddevice as sd
import queue
from vosk import Model, KaldiRecognizer
import json
import numpy as np
import sys

# === Step 1: Load Vosk model ===
# For better accuracy, use a larger model like "vosk-model-en-us-0.22"
# Download from: https://alphacephei.com/vosk/models
model_path = "vosk-model-small-en-us-0.15" # <-- UPDATE THIS PATH if needed
try:
    model = Model(model_path)
except Exception as e:
    print(f"Error loading model from '{model_path}'.")
    print("Please make sure the path is correct and the model is unzipped.")
    print("Download models from: https://alphacephei.com/vosk/models")
    exit(1)

# === Step 2: Prepare recognizer ===
samplerate = 16000
rec = KaldiRecognizer(model, samplerate)
q = queue.Queue()
transcript_log = []


# --- CONFIGURATION ---
# For VB-CABLE, the audio is typically on the first channel (0).
TARGET_CHANNEL = 0
# ---

def callback(indata, frames, time, status):
    """This is called (from a separate thread) for each audio block."""
    if status:
        print(status, file=sys.stderr)
    
    audio_np = np.frombuffer(indata, dtype=np.int16)
    audio_reshaped = audio_np.reshape(-1, 2) # VB-Cable is stereo
    channel_data = audio_reshaped[:, TARGET_CHANNEL]
    q.put(channel_data.tobytes())



def find_voicemeeter_output_device():
    print("Searching for Voicemeeter B1 output device...")
    devices = sd.query_devices()
    for i, dev in enumerate(devices):
        name = dev['name'].lower()
        # Look for B1 output device used for capturing
        is_vm_b1 = 'voicemeeter out b1' in name and dev['max_input_channels'] > 0
        
        print(f"  {i}: {dev['name']} — {dev['max_input_channels']} in / {dev['max_output_channels']} out")
        
        if is_vm_b1:
            print(f"✅ Found Voicemeeter B1 device: {i} ({dev['name']})")
            return i
            
    raise RuntimeError("Voicemeeter B1 Output not found. Make sure Voicemeeter is running and B1 is enabled.")


# --- Main Execution ---
try:
    # Use the new function to find the specific device
    device_id = find_voicemeeter_output_device()

    # The stream needs to be stereo (channels=2) as that's what VB-Cable provides
    with sd.RawInputStream(samplerate=samplerate, blocksize=8000, device=device_id,
                           dtype='int16', channels=2, callback=callback):
        
        print(f"🎙️ Using model '{model_path}'.")
        print(f"🎙️ Transcribing audio from VB-CABLE... Press Ctrl+C to stop.\n")
        
        while True:
            data = q.get()
            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                if result.get("text"):
                    final_text = result["text"]
                    transcript_log.append(final_text)
                    print("✅ Final:", final_text.capitalize())
            else:
                partial = json.loads(rec.PartialResult())
                if partial.get("partial"):
                    print("🔹 Partial:", partial["partial"])





except KeyboardInterrupt:
    print("\n⛔ Stopped.")
except Exception as e:
    print(f"An error occurred: {e}")

