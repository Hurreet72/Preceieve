import speech_recognition as sr

r = sr.Recognizer()

try:
    with sr.Microphone() as source:
        print("Using default microphone")
        r.adjust_for_ambient_noise(source, duration=1)
        print("Calibrated for ambient noise.")

        attempts = 0
        max_attempts = 3

        while attempts < max_attempts:
            print("\nSay something...")
            try:
                # Wait up to 10 seconds for you to start speaking
                # Record up to 10 seconds of audio
                audio = r.listen(source, timeout=10, phrase_time_limit=10)
                print("Got audio, recognizing...")
                try:
                    text = r.recognize_google(audio)
                    print("You said:", text)
                    break  # exit loop if recognition succeeds
                except sr.UnknownValueError:
                    print("Could not understand audio")
                except sr.RequestError as e:
                    print("Recognition error; {0}".format(e))
            except sr.WaitTimeoutError:
                print("No speech detected, try again...")

            attempts += 1

        print("\nDone. Exiting program.")

except Exception as e:
    print("Error initializing microphone:", e)
