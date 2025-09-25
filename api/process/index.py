import os
if not os.environ.get("VERCEL"):
    try:
        print("Loading .env.local")
        from dotenv import load_dotenv
        load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env.local'))
    except ImportError:
        print("Warning: python-dotenv not installed, .env.local will not be loaded.")
# Flask version for API POST support
import io
import os
import json
import traceback
from flask import Flask, jsonify, request
from PIL import Image
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

app = Flask(__name__)


# Upstash Redis Python SDK
from upstash_redis import Redis

redis = Redis(
    url=os.environ.get('UPSTASH_REDIS_REST_URL'),
    token=os.environ.get('UPSTASH_REDIS_REST_TOKEN'),
)

def redis_rpop(key):
    return redis.rpop(key)

def redis_lpush(key, value):
    redis.lpush(key, value)

def redis_incr(key):
    redis.incr(key)

JOB_QUEUE = 'jobs:bmp2tiff'
JOB_DONE = 'jobs:done_count'

# Google Drive setup (token/secret from env or config)
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
GOOGLE_REFRESH_TOKEN = os.environ.get('GOOGLE_REFRESH_TOKEN')
GOOGLE_REDIRECT_URI = os.environ.get('GOOGLE_REDIRECT_URI')

# Adobe Lightroom setup (token/secret from env or config)
ADOBE_CLIENT_ID = os.environ.get('ADOBE_CLIENT_ID')

TOKEN_KEY_PREFIX = "google:drive:user:"

def get_drive_client(sub=None):
    refresh_token = GOOGLE_REFRESH_TOKEN
    if sub:
        token_info = redis.hgetall(f"{TOKEN_KEY_PREFIX}{sub}")
        # upstash-redis returns a Future-like object, so we need to resolve it if async
        if hasattr(token_info, 'result'):
            token_info = token_info.result()
        if token_info and token_info.get('refresh_token'):
            refresh_token = token_info['refresh_token']
    creds = Credentials(
        None,
        refresh_token=refresh_token,
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        token_uri='https://oauth2.googleapis.com/token',
    )
    return build('drive', 'v3', credentials=creds)

def download_file_stream(drive, file_id):
    request = drive.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    from googleapiclient.http import MediaIoBaseDownload
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        status, done = downloader.next_chunk()
    buf.seek(0)
    return buf

def bmp_to_tiff_buffer(bmp_stream):
    bmp_img = Image.open(bmp_stream)
    tiff_buf = io.BytesIO()
    bmp_img.save(tiff_buf, format='TIFF')
    tiff_buf.seek(0)
    return tiff_buf

def upload_to_lightroom(tiff_buf, file_name_no_ext, parent_path, sub):
    return {'ok': True, 'file': file_name_no_ext + '.tiff', 'parentPath': parent_path}

@app.route('/process', methods=['POST'])
def process_job():
    try:
        # Lấy sub từ payload POST
        payload = request.get_json(force=True) or {}
        google_drive_sub = payload.get('google_drive_sub')
        adobe_lr_sub = payload.get('adobe_lr_sub')

        raw = redis_rpop(JOB_QUEUE)
        if not raw:
            return jsonify({'status': 'idle', 'message': 'No jobs in queue'})
        job = json.loads(raw)
        drive = get_drive_client(google_drive_sub)
        bmp_stream = download_file_stream(drive, job['fileId'])
        print('[PROCESS] file:', job['fileName'], 'parentPath:', job.get('parentPath'))
        tiff_buf = bmp_to_tiff_buffer(bmp_stream)
        lr = upload_to_lightroom(
            tiff_buf,
            job['fileName'].rsplit('.', 1)[0],
            job.get('parentPath'),
            adobe_lr_sub
        )
        redis_incr(JOB_DONE)
        return jsonify({'status': 'done', 'file': job['fileName'], 'lr': lr})
    except Exception as e:
        print('[PROCESS ERROR]', e)
        traceback.print_exc()
        redis_lpush(JOB_QUEUE, raw)
        return jsonify({'status': 'retry', 'error': str(e), 'trace': traceback.format_exc()}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 4001)))