from flask import Flask, jsonify, request
from flask_cors import CORS
import subprocess
import threading
import atexit
import os
import sys
import tempfile
import re
from pydub import AudioSegment
import openai
from dotenv import load_dotenv

# --- Initialization & Setup ---
load_dotenv()  # Load OPENAI_API_KEY etc.

app = Flask(__name__)
CORS(app)

LOG_DIR = os.path.join(os.getcwd(), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)

running_procs = {}  # Store subprocess objects

openai.api_key = os.getenv("OPENAI_API_KEY")
if not openai.api_key:
    print("[SERVER WARNING] OPENAI_API_KEY is not set. Transcription endpoint may fail.")

# --- Utility Functions ---

def find_interpreter():
    """Find Python interpreter (prefer virtualenv)."""
    if sys.executable and 'venv' in sys.executable:
        return sys.executable
    return 'python'

def is_script_running(script_name):
    proc = running_procs.get(script_name)
    return proc and proc.poll() is None

def drain_stream(stream, prefix, log_file_path=None):
    """Read subprocess output continuously."""
    try:
        log_file = open(log_file_path, 'a', encoding='utf-8') if log_file_path else None
        for line in iter(stream.readline, b''):
            line_str = line.decode('utf-8', errors='ignore').rstrip()
            if not line_str: break
            print(f'{prefix}{line_str}')
            if log_file:
                log_file.write(line_str + '\n')
                log_file.flush()
    except Exception as e:
        if not stream.closed:
            print(f'[starter] Drain error for {prefix}: {e}')
    finally:
        if log_file:
            log_file.close()

def convert_to_wav(input_path, output_path):
    """Convert audio to mono 16kHz WAV for Whisper."""
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_channels(1).set_frame_rate(16000)
    audio.export(output_path, format="wav")


# --- Routes: Script Runner ---

@app.route('/start-script/<script_name>', methods=['POST'])
def start_script_route(script_name):
    """Start a script via HTTP request."""
    if is_script_running(script_name):
        return jsonify(ok=True, msg=f'{script_name} already running')

    if not os.path.exists(script_name) or not script_name.endswith('.py'):
        return jsonify(ok=False, msg=f'Script not found or invalid: {script_name}'), 404

    log_file_path = os.path.join(LOG_DIR, f'{script_name.rsplit(".",1)[0]}.log')
    with open(log_file_path, 'w') as f:
        f.write('')

    python_cmd = find_interpreter()
    cmd = [python_cmd, script_name]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=False, bufsize=0, close_fds=True)
        running_procs[script_name] = proc
    except Exception as e:
        return jsonify(ok=False, msg=f'Failed to start {script_name}: {e}'), 500

    threading.Thread(target=drain_stream, args=(proc.stdout, f'[{script_name} stdout] ', log_file_path), daemon=True).start()
    threading.Thread(target=drain_stream, args=(proc.stderr, f'[{script_name} stderr] '), daemon=True).start()

    return jsonify(ok=True, msg=f'Starting {script_name}', script=script_name)

@app.route('/stop-script/<script_name>', methods=['POST'])
def stop_script(script_name):
    proc = running_procs.get(script_name)
    if not proc or proc.poll() is not None:
        return jsonify(ok=False, msg=f'{script_name} not running')
    try:
        proc.terminate()
        proc.wait(timeout=5)
        del running_procs[script_name]
        return jsonify(ok=True, msg=f'Stopped {script_name}')
    except Exception as e:
        return jsonify(ok=False, msg=f'Error stopping {script_name}: {e}'), 500

@app.route('/get-output/<log_name>', methods=['GET'])
def get_script_output(log_name):
    if '..' in log_name or log_name.startswith('/'):
        return jsonify(content='Access Denied'), 403
    log_file_path = os.path.join(LOG_DIR, log_name)
    if not os.path.exists(log_file_path):
        return jsonify(content=''), 200
    try:
        with open(log_file_path, 'r', encoding='utf-8') as f:
            return jsonify(content=f.read())
    except Exception as e:
        return jsonify(content=f'Error reading log: {e}'), 500

@app.route('/get-status/<script_name>', methods=['GET'])
def get_script_status(script_name):
    base_name = script_name.rsplit('.', 1)[0]
    log_file_path = os.path.join(LOG_DIR, f'{base_name}.log')
    
    if not is_script_running(script_name):
        return jsonify(status="SYSTEM_FAILURE", top1_name="Detector Offline", top1_score=0.0)

    try:
        with open(log_file_path, 'rb') as f:
            f.seek(0, os.SEEK_END)
            last_line = ""
            while True:
                offset = min(f.tell(), 1024)
                if offset == 0:
                    break
                f.seek(-offset, os.SEEK_CUR)
                lines = f.readlines()
                if len(lines) > 1:
                    last_line = lines[-1].decode('utf-8', errors='ignore').strip()
                    break
                elif len(lines) == 1 and f.tell() == offset:
                    last_line = lines[0].decode('utf-8', errors='ignore').strip()
                    break
                elif f.tell() == 0:
                    break

        if last_line:
            match = re.search(r'Status: (OK|EMERGENCY|FAILURE) \| Top1: (.*?) \(([\d.]+)\)', last_line)
            if match:
                return jsonify(
                    status=match.group(1),
                    top1_name=match.group(2),
                    top1_score=float(match.group(3))
                )
            else:
                return jsonify(status="PARSING_FAILURE", top1_name="Parsing Error", top1_score=0.0)
        return jsonify(status="STARTING_UP", top1_name="No Data", top1_score=0.0)
    except Exception as e:
        print(f"[STATUS ERROR] {e}")
        return jsonify(status="SYSTEM_FAILURE", top1_name="Server Error", top1_score=0.0)


# --- Routes: Audio Transcription ---

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    if not openai.api_key:
        return jsonify({"error": "OpenAI API key is not configured."}), 503
    if 'audio' not in request.files:
        return jsonify({"error": "No audio uploaded"}), 400

    audio_file = request.files['audio']
    temp_webm_path = None
    temp_wav_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            audio_file.save(temp_file.name)
            temp_webm_path = temp_file.name

        temp_wav_path = temp_webm_path.replace(".webm", ".wav")
        convert_to_wav(temp_webm_path, temp_wav_path)

        with open(temp_wav_path, "rb") as f:
            transcript = openai.audio.transcriptions.create(
                model="whisper-1",
                file=f
            )

        return jsonify({"transcript": transcript.text})

    except Exception as e:
        print(f"[TRANSCRIBE ERROR] {e}")
        return jsonify({"error": f"Transcription failed: {str(e)}"}), 500

    finally:
        for path in [temp_webm_path, temp_wav_path]:
            if path and os.path.exists(path):
                os.remove(path)


# --- Main Execution ---

if __name__ == '__main__':
    atexit.register(lambda: [proc.terminate() for proc in running_procs.values() if proc.poll() is None])
    print(f'[starter] Using log directory: {LOG_DIR}')

    # Automatically start detector safely
    detector_script = 'detector.py'
    if os.path.exists(detector_script) and not is_script_running(detector_script):
        print('[starter] Automatically starting detector...')
        python_cmd = find_interpreter()
        cmd = [python_cmd, detector_script]
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=False, bufsize=0, close_fds=True)
            running_procs[detector_script] = proc
            threading.Thread(target=drain_stream, args=(proc.stdout, f'[{detector_script} stdout] ', os.path.join(LOG_DIR, f'{detector_script.rsplit(".",1)[0]}.log')), daemon=True).start()
            threading.Thread(target=drain_stream, args=(proc.stderr, f'[{detector_script} stderr] '), daemon=True).start()
            print(f'[starter] Detector {detector_script} started successfully.')
        except Exception as e:
            print(f'[starter] Failed to start detector: {e}')

    print('[starter] Server running on http://127.0.0.1:5000')
    app.run(host='127.0.0.1', port=5000, debug=False)
