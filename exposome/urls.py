from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('home', views.home, name='home'),
    path('search', views.search, name='search'),
    path('map', views.map_page, name='map'), 

    path('api/find_coordinates/', views.find_coordinates_api, name='find_coordinates_api'),
    path('api/get_exposome_data/', views.get_exposome_data_api, name='get_exposome_data_api'),
]