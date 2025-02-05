from flask import Flask, request, send_from_directory, Response
from flask_cors import CORS
import urllib.request
import json
import os
import io
from PIL import Image
import numpy as np
from MODNet_entry import get_model, infer2
import base64
import time
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get API key from environment variables
API_KEY = os.getenv('API_KEY')
if not API_KEY:
    raise ValueError("API_KEY not found in environment variables")

# API Configuration
API_CONFIG = {
    'model': 'black-forest-labs/FLUX.1-dev',
    'image_size': '1024x1024',
    'num_inference_steps': 25,
    'prompt_enhancement': True
}

# Get the absolute path of the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=current_dir, static_url_path='')
CORS(app)

# Create temp directory if not exists
temp_dir = os.path.join(current_dir, 'temp')
if not os.path.exists(temp_dir):
    os.makedirs(temp_dir)

# Initialize MODNet
model = get_model('modnet_photographic_portrait_matting.ckpt')

# Helper function to process image for matting
def process_image_for_matting(image_data):
    # Generate unique filenames for this request
    timestamp = str(int(time.time()))
    input_path = os.path.join(temp_dir, f'input_{timestamp}.png')
    alpha_path = os.path.join(temp_dir, f'alpha_{timestamp}.png')
    output_path = os.path.join(temp_dir, f'output_{timestamp}.png')
    
    try:
        # Save input image
        with open(input_path, 'wb') as f:
            f.write(image_data)
        
        # Process with MODNet
        infer2(model, input_path, alpha_path, output_path)
        
        # Read the processed image
        with open(output_path, 'rb') as f:
            processed_data = f.read()
            
        return base64.b64encode(processed_data).decode('utf-8')
        
    finally:
        # Clean up temporary files
        for temp_file in [input_path, alpha_path, output_path]:
            if os.path.exists(temp_file):
                os.remove(temp_file)

@app.route('/')
def root():
    return send_from_directory(current_dir, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(current_dir, path)):
        return send_from_directory(current_dir, path)
    return 'Not found', 404

@app.route('/proxy/generate', methods=['POST'])
def generate_image():
    try:
        data = request.get_json()
        
        # Add API key from server configuration
        headers = {
            'Authorization': f'Bearer {API_KEY}',
            'Content-Type': 'application/json'
        }

        # Create request body with fixed configuration and user input
        request_body = {
            **API_CONFIG,  # Spread fixed configuration
            'prompt': data.get('prompt')  # Add user's prompt
        }

        req = urllib.request.Request(
            'https://api.siliconflow.cn/v1/images/generations',
            data=json.dumps(request_body).encode('utf-8'),
            headers=headers,
            method='POST'
        )

        with urllib.request.urlopen(req) as response:
            api_response = json.loads(response.read())
            
            # Get the generated image and process it
            if 'data' in api_response and len(api_response['data']) > 0:
                image_url = api_response['data'][0].get('url')
                if image_url:
                    # Download the image
                    img_req = urllib.request.Request(
                        image_url,
                        headers={'User-Agent': 'Mozilla/5.0'}
                    )
                    with urllib.request.urlopen(img_req) as img_response:
                        img_data = img_response.read()
                        
                        # Only process with MODNet if matting is enabled
                        if data.get('enable_matting', True):
                            processed_image = process_image_for_matting(img_data)
                            api_response['data'][0]['processed_image'] = processed_image
                        else:
                            # If matting is disabled, just encode the original image
                            api_response['data'][0]['processed_image'] = base64.b64encode(img_data).decode('utf-8')
            
            return Response(
                json.dumps(api_response),
                mimetype='application/json'
            )

    except urllib.error.HTTPError as e:
        return {
            'error': f'API Error: {str(e)}',
            'details': e.read().decode('utf-8')
        }, e.code
    except Exception as e:
        return {'error': f'Server Error: {str(e)}'}, 500

@app.route('/proxy/image')
def proxy_image():
    try:
        image_url = request.args.get('url')
        if not image_url:
            return {'error': 'Image URL is required'}, 400

        req = urllib.request.Request(
            image_url,
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        
        with urllib.request.urlopen(req) as response:
            return Response(
                response.read(),
                mimetype=response.headers.get('Content-type', 'image/jpeg')
            )

    except Exception as e:
        return {'error': f'Image Proxy Error: {str(e)}'}, 500

if __name__ == '__main__':
    print(f'Server running at http://localhost:8000')
    print(f'Static files served from: {current_dir}')
    app.run(port=8000, debug=True)
