# tk_test.py
import tkinter as tk

# Create the main window
root = tk.Tk()
root.title("TK Test")
root.geometry("300x100")

# Add a label
tk.Label(root, text="Tkinter OK").pack(pady=10)

# Function to close window after delay
def close_after_delay():
    root.destroy()

# Close window after 3 seconds (3000 milliseconds)
root.after(3000, close_after_delay)

print("Opening test window now...")
root.mainloop()
print("Test window closed successfully.")
