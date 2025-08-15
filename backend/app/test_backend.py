# test_backend.py - Run this to test your backend
import requests
import base64
import json
from PIL import Image
import io
import numpy as np

def create_test_image():
    """Create a simple test image"""
    # Create a simple colored image for testing
    img = Image.new('RGB', (224, 224), color='red')
    
    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG')
    img_bytes = buffer.getvalue()
    img_base64 = base64.b64encode(img_bytes).decode()
    
    return f"data:image/jpeg;base64,{img_base64}"

def test_letters_endpoint():
    """Test the letters endpoint"""
    print("🧪 Testing letters endpoint...")
    try:
        response = requests.get('http://127.0.0.1:8000/api/asl/letters/')
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Letters endpoint works! Found {len(data['letters'])} letters")
        else:
            print(f"❌ Letters endpoint failed: {response.text}")
    except Exception as e:
        print(f"❌ Error testing letters endpoint: {e}")

def test_prediction_endpoint():
    """Test the prediction endpoint"""
    print("\n🧪 Testing prediction endpoint...")
    try:
        # Create test image
        test_image = create_test_image()
        print(f"📷 Created test image, size: {len(test_image)} chars")
        
        # Send request
        payload = {
            "image": test_image
        }
        
        response = requests.post(
            'http://127.0.0.1:8000/api/asl/predict/',
            json=payload,
            headers={'Content-Type': 'application/json'}
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Prediction endpoint works!")
            print(f"Predicted letter: {data['predicted_letter']}")
            print(f"Confidence: {data['confidence']:.3f}")
        else:
            print(f"❌ Prediction endpoint failed: {response.text}")
            
    except Exception as e:
        print(f"❌ Error testing prediction endpoint: {e}")

def check_server_running():
    """Check if Django server is running"""
    print("🔍 Checking if Django server is running...")
    try:
        response = requests.get('http://127.0.0.1:8000/')
        print(f"✅ Django server is running (status: {response.status_code})")
        return True
    except Exception as e:
        print(f"❌ Django server not accessible: {e}")
        print("Make sure you run: python manage.py runserver")
        return False

if __name__ == "__main__":
    print("🚀 Testing ASL Backend API\n")
    
    if check_server_running():
        test_letters_endpoint()
        test_prediction_endpoint()
    
    print("\n📋 Next steps:")
    print("1. If Django server isn't running: python manage.py runserver")
    print("2. Check Django console for detailed logs")
    print("3. Open browser developer tools to see network requests")
    print("4. Make sure your React app is running: npm start")