import speech_recognition as sr
import numpy as np
import matplotlib.pyplot as plt
import cv2
from easygui import *
import os
from PIL import Image, ImageTk
from itertools import count
import tkinter as tk
import string
import requests 

# --- WEATHER CONFIGURATION (SETUP) ---

# 1. YOUR ACTUAL API KEY IS EMBEDDED HERE
WEATHER_API_KEY = "23898a737112967a20a5613ce31a485c" 
WEATHER_URL = "http://api.openweathermap.org/data/2.5/weather"

# 2. Updated Map: ADDING "HAZE" AND "MIST" for better coverage.
WEATHER_SIGNS = {
    "clear sky": "sunny",
    "few clouds": "cloudy",
    "scattered clouds": "cloudy",
    "broken clouds": "cloudy",
    "shower rain": "rain",
    "rain": "rain",
    "thunderstorm": "thunder",
    "snow": "snow",
    "mist": "fog", 
    "haze": "fog" # <--- *FIXED: ADDED HAZE*
}
# --- END WEATHER CONFIGURATION ---

# --- IMAGE LABEL CLASS (HANDLES GIF ANIMATION) ---
class ImageLabel(tk.Label):
    def load(self, im_path):
        try:
            im = Image.open(im_path)
        except FileNotFoundError:
            print(f"ERROR: GIF file not found at path: {im_path}. Check your ISL_Gifs folder.")
            return

        self.loc = 0
        self.frames = []

        try:
            for i in count(1):
                self.frames.append(ImageTk.PhotoImage(im.copy()))
                im.seek(i)
        except EOFError:
            pass

        try:
            self.delay = im.info['duration']
        except:
            self.delay = 100

        if len(self.frames) == 1:
            self.config(image=self.frames[0])
        else:
            self.next_frame()

    def unload(self):
        self.config(image=None)
        self.frames = None

    def next_frame(self):
        if self.frames:
            self.loc += 1
            self.loc %= len(self.frames)
            self.config(image=self.frames[self.loc])
            self.after(self.delay, self.next_frame)

# --- WEATHER FETCHING FUNCTION ---
def get_weather_sign(city):
    """Fetches weather data from the API and returns a matching sign filename."""
    params = {
        'q': city,
        'appid': WEATHER_API_KEY,
        'units': 'metric'
    }
    
    try:
        response = requests.get(WEATHER_URL, params=params)
        response.raise_for_status() 
        data = response.json()
        
        weather_description = data['weather'][0]['description'].lower()
        print(f"API returned condition: {weather_description}")
        
        # This line now successfully looks up 'haze' and returns 'fog'
        return WEATHER_SIGNS.get(weather_description) 
        
    except requests.exceptions.HTTPError as err:
        print(f"\n[WEATHER ERROR]: City not found or API issue. {err}")
        return None
    except Exception as e:
        print(f"\n[WEATHER ERROR]: An error occurred during weather fetch: {e}")
        return None

# --- MAIN APPLICATION FUNCTION (func) ---
def func():
    r = sr.Recognizer()
    
    # EXISTING FULL LIST 
    isl_gif = ['any questions', 'are you angry', 'are you busy', 'are you hungry', 'are you sick', 'be careful',
               'can we meet tomorrow', 'did you book tickets', 'did you finish homework', 'do you go to office', 'do you have money',
               'do you want something to drink', 'do you want tea or coffee', 'do you watch TV', 'dont worry', 'flower is beautiful',
               'good afternoon', 'good evening', 'good morning', 'good night', 'good question', 'had your lunch', 'happy journey',
               'hello what is your name', 'how many people are there in your family', 'i am a clerk', 'i am bore doing nothing', 
               'i am fine', 'i am sorry', 'i am thinking', 'i am tired', 'i dont understand anything', 'i go to a theatre', 'i love to shop',
               'i had to say something but i forgot', 'i have headache', 'i like pink colour', 'i live in nagpur', 'lets go for lunch', 'my mother is a homemaker',
               'my name is john', 'nice to meet you', 'no smoking please', 'open the door', 'please call me later',
               'please clean the room', 'please give me your pen', 'please use dustbin dont throw garbage', 'please wait for sometime', 'shall I help you',
               'shall we go together tommorow', 'sign language interpreter', 'sit down', 'stand up', 'take care', 'there was traffic jam', 'wait I am thinking',
               'what are you doing', 'what is the problem', 'what is todays date', 'what is your father do', 'what is your job',
               'what is your mobile number', 'what is your name', 'whats up', 'when is your interview', 'when we will go', 'where do you stay',
               'where is the bathroom', 'where is the police station', 'you are wrong','address','agra','ahemdabad', 'all', 'april', 'assam', 'august', 'australia', 'badoda', 'banana', 'banaras', 'banglore',
               'bihar','bihar','bridge','cat', 'chandigarh', 'chennai', 'christmas', 'church', 'clinic', 'coconut', 'crocodile','dasara',
               'deaf', 'december', 'deer', 'delhi', 'dollar', 'duck', 'febuary', 'friday', 'fruits', 'glass', 'grapes', 'gujrat', 'hello',
               'hindu', 'hyderabad', 'india', 'january', 'jesus', 'job', 'july', 'july', 'karnataka', 'kerala', 'krishna', 'litre', 'mango',
               'may', 'mile', 'monday', 'mumbai', 'museum', 'muslim', 'nagpur', 'october', 'orange', 'pakistan', 'pass', 'police station',
               'post office', 'pune', 'punjab', 'rajasthan', 'ram', 'restaurant', 'saturday', 'september', 'shop', 'sleep', 'southafrica',
               'story', 'sunday', 'tamil nadu', 'temperature', 'temple', 'thursday', 'toilet', 'tomato', 'town', 'tuesday', 'usa', 'village',
               'voice', 'wednesday', 'weight','please wait for sometime','what is your mobile number','what are you doing','are you busy']


    arr = list(string.ascii_lowercase)

    try:
        with sr.Microphone() as source:
            print("Say something...")
            r.adjust_for_ambient_noise(source, duration=3) 
            
            try:
                audio = r.listen(source, timeout=10, phrase_time_limit=10)
                a = r.recognize_google(audio)
                print("You said:", a.lower())

                # Clean and prepare text
                a_clean = a.lower()
                for c in string.punctuation:
                    a_clean = a_clean.replace(c, "")

                # 1. CHECK FOR GOODBYE
                if a_clean in ['goodbye', 'good bye', 'bye']:
                    quit()

                # 2. CHECK FOR WEATHER QUERY (NEW LOGIC)
                elif "weather" in a_clean:
                    print("\nWeather query detected.")
                    city = "Delhi"
                    
                    words = a_clean.split()
                    if "in" in words:
                        try:
                            city_index = words.index("in") + 1
                            if city_index < len(words):
                                city = words[city_index].title()
                        except ValueError:
                            pass 

                    print(f"Fetching weather sign for: {city}")
                    sign_filename = get_weather_sign(city)
                    
                    if sign_filename:
                        # FIX 1: Using os.path.join for correct GIF path
                        gif_path = os.path.join('ISL_Gifs', f'{sign_filename}.gif')
                        root = tk.Tk()
                        lbl = ImageLabel(root)
                        lbl.pack()
                        lbl.load(gif_path)
                        root.mainloop()
                    else:
                        print("Weather sign not generated. Spelling out 'weather' as a fallback.")
                        # Fallback to spelling 'weather' if API fails
                        for ch in "weather":
                             if ch in arr:
                                 # FIX 2: Correcting spelling image path
                                 img_path = os.path.join('letters', f'{ch}.jpg')
                                 if os.path.exists(img_path):
                                     img = Image.open(img_path)
                                     img_np = np.asarray(img)
                                     plt.imshow(img_np)
                                     plt.draw()
                                     plt.pause(0.8)
                                 plt.close()

                # 3. CHECK FOR FIXED PHRASE (Existing Logic)
                elif a_clean in isl_gif: 
                    # FIX 3: Correcting fixed phrase GIF path
                    gif_filename = a_clean.replace(' ', '_')
                    gif_path = os.path.join('ISL_Gifs', f'{gif_filename}.gif')
                    
                    root = tk.Tk()
                    lbl = ImageLabel(root)
                    lbl.pack()
                    lbl.load(gif_path) 
                    root.mainloop()

                # 4. SPELL OUT UNKNOWN WORDS (Existing Logic)
                else: 
                    print("Unlisted word/phrase. Spelling out...")
                    for ch in a_clean:
                        if ch in arr:
                            # FIX 4: Correcting spelling image path
                            img_path = os.path.join('letters', f'{ch}.jpg')
                            if os.path.exists(img_path):
                                img = Image.open(img_path)
                                img_np = np.asarray(img)
                                plt.imshow(img_np)
                                plt.draw()
                                plt.pause(0.8)
                            plt.close()

            except sr.UnknownValueError:
                print("Could not understand audio")
            except sr.RequestError as e:
                print("Recognition error; {0}".format(e))
            except sr.WaitTimeoutError:
                print("No speech detected. Try again...")

    except Exception as e:
        print("Error initializing microphone:", e)
        
# --- MAIN PROGRAM LOOP ---
while True:
    image = "signlang.png"
    msg = "HEARING IMPAIRMENT ASSISTANT (Weather Ready)"
    choices = ["Live Voice","All Done!"] 
    reply = buttonbox(msg, image=image, choices=choices)
    if reply == choices[0]:
        func()
    elif reply == choices[1]:
        quit()