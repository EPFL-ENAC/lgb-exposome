import json
import os
import requests
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from shapely.geometry import Point, shape
# Note: boolean_point_in_polygon from turfpy is for GeoJSON objects.
# For shapely Polygon.contains(Point), direct method is used.
# If you intend to use turfpy's boolean_point_in_polygon with shapely objects,
# you might need to convert shapely objects to GeoJSON dicts first.
# For simplicity, I'll stick to shapely's .contains() for polygon check.
# If you still want to use turfpy.measurement.boolean_point_in_polygon,
# ensure the 'feature' argument is a GeoJSON Feature dictionary.

# Helper function to load GeoJSON files safely
def load_geojson_file(file_path):
    """
    Loads a GeoJSON file and returns its 'features' list.
    Handles FileNotFoundError, JSONDecodeError, and missing 'features' key.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if 'features' not in data:
                print(f"Erreur: Le fichier GeoJSON '{file_path}' ne contient pas la clé 'features'.")
                return None
            return data['features'] # Assurez-vous que c'est une FeatureCollection
    except FileNotFoundError:
        print(f"Erreur: Le fichier GeoJSON est introuvable à l'emplacement: {file_path}")
        return None
    except json.JSONDecodeError:
        print(f"Erreur: Le fichier '{file_path}' n'est pas un JSON valide.")
        return None
    except Exception as e:
        print(f"Erreur inattendue lors du chargement de '{file_path}': {e}")
        return None

# Mapping for canton names from canton_2.geojson to hectare file suffixes
# This ensures the correct hectare GeoJSON file is loaded based on the canton name.
CANTON_FILE_MAPPING = {
    'Vaud': 'vaud',
    'Geneve': 'geneve',
    'Jura': 'jura',
    'Neuchatel': 'neuchatel',
    'Fribourg': 'fribourg',
    'Bern': 'bern',
    'Basel_Landschaft': 'basel', # Both Basel cantons map to 'basel'
    'Basel_Stadt': 'basel',     # Both Basel cantons map to 'basel'
    'Solothurn': 'solothurn',
    'Valais': 'wallis', # Special case as per original JS logic
    'Graubunden': 'graubunden',
    'Ticino': 'ticino',
    'Uri': 'uri',
    'Schwyz': 'schwyz',
    'Glarus': 'glarus',
    'Aargau': 'aargau',
    'Luzern': 'luzern',
    'Nidwalden': 'nidwalden',
    'Obwalden': 'obwalden',
    'Zug': 'zug',
    'Zurich': 'zurich',
    'Schaffhausen': 'schaffhausen',
    'Thurgau': 'thurgau',
    'St_Gallen': 'st_gallen',
    'Appenzell_Ausserhoden': 'appenzell_ausser',
    'Appenzell_Innerrhoden': 'appenzell_inner',
}


# Load Suisse total statistics once (assuming suisse_total.json exists and is correctly structured)
suisse_stats_path = os.path.join(settings.GEOJSON_ROOT, 'suisse_total.json')
try:
    with open(suisse_stats_path, 'r', encoding='utf-8') as f:
        suisse_stats = json.load(f)
except (FileNotFoundError, json.JSONDecodeError) as e:
    print(f"Erreur lors du chargement des statistiques suisses: {e}")
    # Default values if file is not found or corrupted
    suisse_stats = {"ndvi": "N/A", "income": "N/A", "pm25": "N/A", "noise": "N/A"}

# Views for rendering HTML pages
def index(request):
    """Renders the default index page."""
    return render(request, 'index.html')

def home(request):
    """Renders the home page."""
    return render(request, 'accueil.html')

def search(request):
    """Renders the search page (exposome.html)."""
    return render(request, 'exposome.html')

def map_page(request):
    """Renders the map page (carte.html)."""
    # If 'carte.html' is not provided, this view can be removed or return an error.
    return render(request, 'carte.html')


# API endpoint to find coordinates from address
def find_coordinates_api(request):
    """
    API to find coordinates (latitude, longitude) from an address.
    Expects 'address', 'npa', 'city' parameters via GET.
    """
    address = request.GET.get('address')
    npa = request.GET.get('npa')
    city = request.GET.get('city')

    if not all([address, npa, city]):
        return JsonResponse({'error': 'Adresse, NPA et ville sont requis.'}, status=400)

    search_text = f"{address}, {npa}, {city}"
    # Using the geo.admin.ch API for geocoding
    url = f"https://api3.geo.admin.ch/rest/services/api/SearchServer?layer=ch.bfs.gebaeude_wohnungs_register&searchText={search_text}&type=locations&origins=address,zipcode&sr=4326"

    try:
        response = requests.get(url)
        response.raise_for_status() # Raises an HTTPError for bad responses (4xx or 5xx)
        data = response.json()

        if data and data.get('results'):
            first_result = data['results'][0]
            # Ensure these keys exist in the API response structure
            latitude = first_result['attrs']['y']
            longitude = first_result['attrs']['x']
            return JsonResponse({'latitude': latitude, 'longitude': longitude})
        else:
            return JsonResponse({'error': 'Coordonnées non trouvées pour l\'adresse donnée.'}, status=404)
    except requests.exceptions.RequestException as e:
        print(f"Erreur lors de l'appel à l'API geo.admin.ch: {e}")
        return JsonResponse({'error': f'Erreur de communication avec le service de géocodage: {e}'}, status=500)
    except KeyError as e:
        print(f"Erreur: Clé manquante dans la réponse de l'API geo.admin.ch: {e}")
        return JsonResponse({'error': f'Format de réponse inattendu de l\'API de géocodage. Clé manquante: {e}'}, status=500)
    except Exception as e:
        print(f"Erreur inattendue dans find_coordinates_api: {e}")
        return JsonResponse({'error': f'Une erreur inattendue est survenue: {e}'}, status=500)


# API endpoint to get exposome data based on coordinates
def get_exposome_data_api(request):
    """
    API to get exposome data for a given point (longitude, latitude).
    Finds the canton, then the specific hectare, and calculates statistics.
    """
    try:
        longitude = float(request.GET.get('longitude'))
        latitude = float(request.GET.get('latitude'))
    except (TypeError, ValueError):
        return JsonResponse({'error': 'Longitude et Latitude valides sont requises.'}, status=400)

    point = Point(longitude, latitude)

    # Load GeoJSON data for cantons
    canton_geojson_path = os.path.join(settings.GEOJSON_ROOT, 'canton_2.geojson')
    cantons_data = load_geojson_file(canton_geojson_path)
    if cantons_data is None:
        return JsonResponse({'error': 'Impossible de charger les données des cantons. Vérifiez le fichier canton_2.geojson.'}, status=500)

    found_canton_name = None
    # Find the canton containing the point
    for feature in cantons_data:
        canton_polygon = shape(feature['geometry'])
        if canton_polygon.contains(point):
            found_canton_name = feature['properties']['NAME']
            break

    if not found_canton_name:
        # If point is not strictly inside a canton, you might want to find the closest one
        # For now, if not found, return 404
        return JsonResponse({'error': 'Aucun canton trouvé pour les coordonnées données.'}, status=404)

    # Determine the correct hectare file name suffix using the mapping
    hectare_file_suffix = CANTON_FILE_MAPPING.get(found_canton_name)
    if not hectare_file_suffix:
        print(f"Erreur: Nom de canton '{found_canton_name}' non mappé à un fichier d'hectare dans CANTON_FILE_MAPPING.")
        return JsonResponse({'error': f'Nom de canton non reconnu pour le mappage des fichiers d\'hectare: {found_canton_name}.'}, status=500)

    hectare_geojson_path = os.path.join(settings.GEOJSON_ROOT, 'hectares', f'hectare_{hectare_file_suffix}.geojson')
    
    hectares_data = load_geojson_file(hectare_geojson_path)
    if hectares_data is None:
        print(f"Avertissement: Impossible de charger les données d'hectare pour le canton {found_canton_name} depuis {hectare_geojson_path}.")
        return JsonResponse({'error': f'Impossible de charger les données d\'hectare pour le canton {found_canton_name}.'}, status=500)

    # Initialize data containers
    hectare_data = {"RELI_ndvi": "N/A", "RELI_income": "N/A", "RELI_pm25": "N/A", "RELI_noise": "N/A"}
    all_canton_ndvi = []
    all_canton_income = []
    all_canton_pm25 = []
    all_canton_noise = []

    # Find the specific hectare for the point and collect all canton data for statistics
    found_hectare = None
    for feature in hectares_data:
        # Convert GeoJSON feature to shapely polygon for contains check
        hectare_polygon = shape(feature['geometry'])
        if hectare_polygon.contains(point):
            found_hectare = feature
            # No break here, continue to collect all data for canton stats
        
        # Collect all data for canton statistics
        props = feature['properties']
        if 'NDVI_MEAN' in props and props['NDVI_MEAN'] is not None:
            try:
                all_canton_ndvi.append(float(props['NDVI_MEAN']))
            except ValueError:
                pass # Skip if not a valid number
        if 'IQMD' in props and props['IQMD'] is not None:
            try:
                all_canton_income.append(float(props['IQMD']))
            except ValueError:
                pass
        if 'PM25_MD' in props and props['PM25_MD'] is not None:
            try:
                all_canton_pm25.append(float(props['PM25_MD']))
            except ValueError:
                pass
        if 'NOISE_MD' in props and props['NOISE_MD'] is not None:
            try:
                all_canton_noise.append(float(props['NOISE_MD']))
            except ValueError:
                pass

    # If no exact hectare found, find the closest one
    if not found_hectare:
        min_distance_hectare = float('inf')
        closest_hectare_feature = None
        for feature in hectares_data:
            hectare_polygon = shape(feature['geometry'])
            distance = point.distance(hectare_polygon)
            if distance < min_distance_hectare:
                min_distance_hectare = distance
                closest_hectare_feature = feature
        found_hectare = closest_hectare_feature # Use the closest one if no direct hit

    if found_hectare:
        properties = found_hectare['properties']
        hectare_data = {
            "RELI_ndvi": properties.get('NDVI_MEAN', 'N/A'),
            "RELI_income": properties.get('IQMD', 'N/A'),
            "RELI_pm25": properties.get('PM25_MD', 'N/A'),
            "RELI_noise": properties.get('NOISE_MD', 'N/A'),
        }
    else:
        # This case should ideally not be reached if hectares_data is not empty
        return JsonResponse({'error': 'Aucun hectare trouvé ou le plus proche pour les coordonnées données.'}, status=404)


    # Calculate canton statistics
    canton_stats = {
        "avg_ndvi": sum(all_canton_ndvi) / len(all_canton_ndvi) if all_canton_ndvi else "N/A",
        "median_income": sorted(all_canton_income)[len(all_canton_income)//2] if all_canton_income else "N/A",
        "median_pm25": sorted(all_canton_pm25)[len(all_canton_pm25)//2] if all_canton_pm25 else "N/A",
        "median_noise": sorted(all_canton_noise)[len(all_canton_noise)//2] if all_canton_noise else "N/A",
    }
    # For median, if even number of elements, take average of two middle elements
    if all_canton_income and len(all_canton_income) % 2 == 0:
        mid = len(all_canton_income) // 2
        canton_stats["median_income"] = (sorted(all_canton_income)[mid - 1] + sorted(all_canton_income)[mid]) / 2
    if all_canton_pm25 and len(all_canton_pm25) % 2 == 0:
        mid = len(all_canton_pm25) // 2
        canton_stats["median_pm25"] = (sorted(all_canton_pm25)[mid - 1] + sorted(all_canton_pm25)[mid]) / 2
    if all_canton_noise and len(all_canton_noise) % 2 == 0:
        mid = len(all_canton_noise) // 2
        canton_stats["median_noise"] = (sorted(all_canton_noise)[mid - 1] + sorted(all_canton_noise)[mid]) / 2


    all_data_for_plots = {
        "ndvi": all_canton_ndvi,
        "income": all_canton_income,
        "pm25": all_canton_pm25,
        "noise": all_canton_noise,
    }

    return JsonResponse({
        'canton': found_canton_name,
        'hectare_data': hectare_data,
        'canton_stats': canton_stats,
        'suisse_stats': suisse_stats,
        'all_data_for_plots': all_data_for_plots
    })