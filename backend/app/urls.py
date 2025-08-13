from django.urls import path
from .views import ASLPredictionView, ASLLettersView

urlpatterns = [
    path('predict/', ASLPredictionView.as_view(), name='asl_predict'),
    path('letters/', ASLLettersView.as_view(), name='asl_letters'),
]