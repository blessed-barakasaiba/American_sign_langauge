from django.urls import path
from . import views

urlpatterns = [
    path('predict_sign/', views.predict_sign, name='predict_sign'),
]