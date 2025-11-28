import sounddevice as sd
import numpy as np
import threading
import tkinter as tk
from scipy.signal import butter, lfilter
import time

SAMPLE_RATE = 44100
BLOCK_DURATION = 0.2  # seconds
EMERGENCY_FREQ_RANGE = (500, 2000)  # Hz


background_rms = 0.0
ALPHA = 0.05 

emergency_active = False

def butter_bandpass(lowcut, highcut, fs, order=4):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype='band')
    return b, a

def bandpass_filter(data, lowcut, highcut, fs, order=4):
    b, a = butter_bandpass(lowcut, highcut, fs, order=order)
    y = lfilter(b, a, data)
    return y

def show_emergency_popup():
    global emergency_active
    if emergency_active:
        return
    emergency_active = True

    def close_popup():
        global emergency_active
        emergency_active = False
        popup.destroy()

    popup = tk.Tk()
    popup.title("EMERGENCY")
    popup.geometry("300x150")
    popup.configure(bg="red")

    label = tk.Label(popup, text="⚠ EMERGENCY SOUND DETECTED ⚠", bg="red", fg="white", font=("Arial", 12, "bold"))
    label.pack(pady=20)

    cancel_btn = tk.Button(popup, text="CANCEL", command=close_popup, bg="white", fg="red", font=("Arial", 10, "bold"))
    cancel_btn.pack(pady=10)

    popup.attributes("-topmost", True)
    popup.mainloop()

def audio_callback(indata, frames, time_info, status):
    global background_rms
    audio = indata[:, 0]

    
    filtered_audio = bandpass_filter(audio, EMERGENCY_FREQ_RANGE[0], EMERGENCY_FREQ_RANGE[1], SAMPLE_RATE)
    
   
    rms = np.sqrt(np.mean(filtered_audio**2))

    
    background_rms = (1 - ALPHA) * background_rms + ALPHA * rms

    
    threshold = background_rms * 5

    
    print(f"RMS: {rms:.6f}, Threshold: {threshold:.6f}")

    if rms > threshold:
        print("Emergency detected!")
        threading.Thread(target=show_emergency_popup).start()

def start_listening():
    print("Listening for emergency sounds...")
    with sd.InputStream(callback=audio_callback, channels=1, samplerate=SAMPLE_RATE, blocksize=int(SAMPLE_RATE*BLOCK_DURATION)):
        while True:
            time.sleep(0.1)

if __name__ == "__main__":
    start_listening()
