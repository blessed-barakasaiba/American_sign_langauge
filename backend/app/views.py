import os
import cv2
import numpy as np
import base64
import io
from PIL import Image
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from tensorflow.keras.models import load_model
import json

class ASLPredictionView(APIView):
    def __init__(self):
        super().__init__()
        # Load your trained model
        model_path = os.path.join(settings.BASE_DIR, 'models', 'best_model.h5')
        self.model = load_model(model_path)
        
        # ASL alphabet mapping
        self.class_labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 
                           'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 
                           'U', 'V', 'W', 'X', 'Y', 'Z']

    def preprocess_image(self, image_data):
        """Preprocess image for model prediction"""
        try:
            # Decode base64 image
            image_data = image_data.split(',')[1] if ',' in image_data else image_data
            image_bytes = base64.b64decode(image_data)
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Resize to model input size (adjust based on your model)
            image = image.resize((64, 64))  # Adjust size as needed
            
            # Convert to numpy array and normalize
            image_array = np.array(image)
            image_array = image_array.astype('float32') / 255.0
            image_array = np.expand_dims(image_array, axis=0)
            
            return image_array
        except Exception as e:
            print(f"Error preprocessing image: {e}")
            return None

    def post(self, request):
        try:
            image_data = request.data.get('image')
            if not image_data:
                return Response(
                    {'error': 'No image data provided'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Preprocess the image
            processed_image = self.preprocess_image(image_data)
            if processed_image is None:
                return Response(
                    {'error': 'Failed to process image'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Make prediction
            predictions = self.model.predict(processed_image)
            predicted_class = np.argmax(predictions[0])
            confidence = float(predictions[0][predicted_class])
            
            predicted_letter = self.class_labels[predicted_class]

            # Return prediction with confidence
            return Response({
                'predicted_letter': predicted_letter,
                'confidence': confidence,
                'all_predictions': {
                    self.class_labels[i]: float(predictions[0][i]) 
                    for i in range(len(self.class_labels))
                }
            })

        except Exception as e:
            return Response(
                {'error': f'Prediction failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class ASLLettersView(APIView):
    """Get all ASL letters for reference"""
    def get(self, request):
        letters = [
            {
                'letter': chr(ord('A') + i),
                'index': i,
                'description': f'ASL sign for letter {chr(ord("A") + i)}'
            }
            for i in range(26)
        ]
        return Response({'letters': letters})
