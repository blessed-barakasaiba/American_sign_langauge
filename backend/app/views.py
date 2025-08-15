from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from tensorflow.keras.models import load_model
from PIL import Image
import base64
import io
import numpy as np
import logging
import json

# Set up logging
logger = logging.getLogger(__name__)

# Model loading (do this once at startup)
try:
    MODEL_PATH = "/home/baraka-blessed/Blessed-react/american_sign_language/backend/app/models/best_model.h5"
    model = load_model(MODEL_PATH)
    logger.info("Model loaded successfully")
except Exception as e:
    logger.error(f"Failed to load model: {str(e)}")
    model = None

@csrf_exempt
def predict_sign(request):
    if request.method != "POST":
        return JsonResponse({'success': False, 'error': "Only POST requests allowed"}, status=405)
    
    if model is None:
        return JsonResponse({'success': False, 'error': "Model not loaded"}, status=500)

    try:
        # Check content type and handle accordingly
        content_type = request.content_type
        
        if content_type.startswith('multipart/form-data'):
            # Handle FormData from frontend
            image_data = request.POST.get('image')
            if not image_data:
                return JsonResponse({'success': False, 'error': "No image data in form"}, status=400)
        
        elif content_type == 'application/json':
            # Handle JSON data
            try:
                data = json.loads(request.body)
                image_data = data.get('image')
            except json.JSONDecodeError:
                return JsonResponse({'success': False, 'error': "Invalid JSON"}, status=400)
        
        else:
            # Handle URL-encoded data (fallback)
            body = request.body.decode('utf-8')
            if not body:
                return JsonResponse({'success': False, 'error': "Empty request body"}, status=400)
            
            from urllib.parse import parse_qs
            params = parse_qs(body)
            image_data = params.get('image', [''])[0]
        
        if not image_data:
            return JsonResponse({'success': False, 'error': "No image data provided"}, status=400)

        # Remove data URL prefix if present (data:image/jpeg;base64,)
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        try:
            # Decode base64 image
            image_bytes = base64.b64decode(image_data)
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if needed
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Resize to expected dimensions (64x64 based on model requirements)
            image = image.resize((64, 64))
            
            # Convert to numpy array and normalize
            image_array = np.array(image) / 255.0
            image_array = np.expand_dims(image_array, axis=0)
            
            # Verify input shape
            if image_array.shape[1:] != model.input_shape[1:]:
                return JsonResponse({
                    'success': False,
                    'error': f"Invalid image dimensions. Expected {model.input_shape[1:]}, got {image_array.shape[1:]}"
                }, status=400)

            # Make prediction
            prediction = model.predict(image_array)
            predicted_class = np.argmax(prediction)
            confidence = np.max(prediction)
            
            # Map to ASL letters
            asl_letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            if predicted_class >= len(asl_letters):
                return JsonResponse({
                    'success': False,
                    'error': f"Invalid class index {predicted_class}"
                }, status=500)
            
            predicted_letter = asl_letters[predicted_class]
            
            logger.info(f"Prediction successful: {predicted_letter} with confidence {confidence:.2f}")
            
            return JsonResponse({
                'letter': predicted_letter,
                'confidence': float(confidence),
                'success': True
            })
            
        except Exception as e:
            logger.error(f"Image processing error: {str(e)}")
            return JsonResponse({
                'success': False,
                'error': f"Image processing error: {str(e)}"
            }, status=400)
            
    except Exception as e:
        logger.error(f"Server error: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f"Server error: {str(e)}"
        }, status=500)