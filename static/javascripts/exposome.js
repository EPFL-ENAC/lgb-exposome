$(document).ready(function () {
  // Autocomplétion pour le champ NPA (Code Postal)
  $("#search_NPA").autocomplete({
    autoFocus: true,
    source: function (request, response) {
      // Appel AJAX à l'API geo.admin.ch pour la recherche de NPA
      $.ajax({
        url:
          "https://api3.geo.admin.ch/rest/services/api/MapServer/find?layer=ch.swisstopo-vd.ortschaftenverzeichnis_plz&searchText=" +
          request.term +
          "&searchField=plz",
        dataType: "json",
        data: { query: request.term },
        success: function (data) {
          // Transforme les résultats pour l'autocomplétion
          var transformed = $.map(data.results, function (el) {
            return {
              value: el.attributes.plz,
            };
          });
          response(transformed);
        },
        error: function () {
          response([]); // Retourne une liste vide en cas d'erreur
        },
      });
    },
  });

  // Gestionnaire d'événement pour le champ NPA lorsque le focus est perdu (blur)
  $("#search_NPA").on("blur", function () {
    // Appel AJAX pour obtenir la ville associée au NPA
    $.getJSON(
      "https://api3.geo.admin.ch/rest/services/api/MapServer/find?layer=ch.swisstopo-vd.ortschaftenverzeichnis_plz&searchText=" +
        $("#search_NPA").val() +
        "&searchField=plz",
      function (el) {
        var city = $.map(el.results, function (i) {
          return i.attributes.langtext;
        });

        // Correction spécifique pour certaines villes
        if (city == "Cheseaux-Noréaz,Yverdon-les-Bains") {
          city = "Yverdon-les-Bains";
        } else if (city == "Prilly,Jouxtens-Mézery") {
          city = "Prilly";
        }

        $("#search_ville").val(city); // Met à jour le champ Ville
      },
    );
  });

  // Autocomplétion pour le champ Adresse
  $("#search_adress").autocomplete({
    autoFocus: true,
    source: function (request, response) {
      var bbox;
      // Récupère la bbox (bounding box) du NPA pour affiner la recherche d'adresse
      $.getJSON(
        "https://api3.geo.admin.ch/rest/services/api/MapServer/find?layer=ch.swisstopo-vd.ortschaftenverzeichnis_plz&searchText=" +
          $("#search_NPA").val() +
          "&searchField=plz",
        function (data) {
          bbox = JSON.stringify(data.results[0].bbox);

          // Appel AJAX à l'API geo.admin.ch pour la recherche d'adresse
          $.ajax({
            url:
              "https://api3.geo.admin.ch/rest/services/api/SearchServer?layer=ch.bfs.gebaeude_wohnungs_register&searchText=" +
              request.term +
              "&type=locations&bbox=" +
              bbox.slice(1, -1) +
              "&origins=address",
            dataType: "json",
            data: { query: request.term },
            success: function (data) {
              var transformed = $.map(data.results, function (el) {
                return {
                  value: el.attrs.label.split("<b>")[0],
                };
              });
              response(transformed);
            },
          });
        },
      );
    },
  });
});

// Fonction pour afficher le contenu des onglets (NDVI, Revenu, etc.)
function displayContent(event, contentNameID) {
  let content = document.getElementsByClassName("contentClass");
  let totalCount = content.length;

  // Cache tous les contenus d'onglets
  for (let count = 0; count < totalCount; count++) {
    content[count].style.display = "none";
  }

  let links = document.getElementsByClassName("linkClass");
  totalLinks = links.length;

  // Retire la classe 'active' de tous les liens d'onglets
  for (let count = 0; count < totalLinks; count++) {
    links[count].classList.remove("active");
  }

  // Affiche le contenu de l'onglet actuel
  document.getElementById(contentNameID).style.display = "block";
  // Ajoute la classe 'active' au lien de l'onglet actuel
  event.currentTarget.classList.add("active");
}

// Variables globales pour la carte et le marqueur
var map;
var marker;
var layers = []; // Tableau pour stocker les couches de la carte

// Fonction d'initialisation de l'application
function init() {
  // Layout par défaut pour les graphiques Plotly
  var layout = {
    autosize: false,
    width: 400,
    height: 600,
  };

  // Données initiales vides pour les graphiques Plotly
  var blank = [
    {
      y: [],
      name: "NDVI",
      pointpos: 0,
      type: "box",
    },
  ];

  // Initialise les graphiques Plotly avec des données vides
  Plotly.newPlot("NDVI", blank, layout);
  Plotly.newPlot("revenu_moyen", blank, layout);
  Plotly.newPlot("bruit_routier", blank, layout);
  Plotly.newPlot("PM_2.5", blank, layout);

  // Attache les gestionnaires d'événements aux boutons
  document.getElementById("search-button").onclick = handleSearchByAddress;
  document.getElementById("Reinitialise").onclick = reinitialise;
  document.getElementById("search-button-map").onclick = handleSearchByMapClick;
  document.getElementById("switchButton").onclick = switchbg;

  // Styles pour les couches de la carte
  var CantonStyle = new ol.style.Style({
    fill: new ol.style.Fill({ color: "rgba(245, 185, 20, 0.6)" }),
    stroke: new ol.style.Stroke({ color: "black", width: 0.5, opacity: 0.5 }),
  });

  var HectareStyle = new ol.style.Style({
    fill: new ol.style.Fill({ color: "rgba(255, 255, 255, 0.6)" }),
    stroke: new ol.style.Stroke({ color: "black", width: 0.5, opacity: 0.5 }),
  });

  // Ajout des couches de base de la carte
  layers.push(
    new ol.layer.Tile({
      visible: false,
      source: new ol.source.XYZ({
        url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      }),
    }),
  );

  layers.push(
    new ol.layer.Tile({
      visible: true,
      source: new ol.source.OSM(),
    }),
  );

  // Couche des cantons (GeoJSON)
  var cantonLayer = new ol.layer.Vector({
    style: CantonStyle,
    source: new ol.source.Vector({
      url: "/geojson/canton_2.geojson", // Chemin vers le fichier GeoJSON
      format: new ol.format.GeoJSON(),
    }),
    visible: true,
    title: "Cantons",
  });
  layers.push(cantonLayer);

  // Ajout des couches d'hectares spécifiques à chaque canton
  addHectareLayers(HectareStyle);

  // Initialisation de la carte OpenLayers
  map = new ol.Map({
    target: "map",
    layers: layers,
    view: new ol.View({
      center: ol.proj.fromLonLat([8, 46.5]),
      zoom: 7,
    }),
  });

  var layer_currentsource = "OSM";

  // Fonction pour basculer entre la carte Open Street Map et Satellite
  function switchbg() {
    if (layer_currentsource == "OSM") {
      layers[0].setVisible(true);
      layers[1].setVisible(false);
      layer_currentsource = "SAT";
      document.getElementById("switchButton").value = "Satellite";
    } else {
      layers[0].setVisible(false);
      layers[1].setVisible(true);
      layer_currentsource = "OSM";
      document.getElementById("switchButton").value = "Open Street Map";
    }
  }

  // Gestionnaire d'événement pour le zoom de la carte (visibilité des cantons)
  map.on("moveend", function (event) {
    if (map.getView().getZoom() > 9) {
      layers[2].setVisible(false); // Cache la couche des cantons
    } else if (map.getView().getZoom() < 9) {
      layers[2].setVisible(true); // Affiche la couche des cantons
    }
  });

  // Configuration de l'overlay pour afficher les informations des features
  const overlayContainerElement = document.querySelector(".overlay-container");
  const overlayLayer = new ol.Overlay({ element: overlayContainerElement });
  map.addOverlay(overlayLayer);
  const overlayFeatureRELI = document.getElementById("feature-RELI");
  const overlayFeatureNDVI = document.getElementById("feature-NDVI");
  const overlayFeatureIncome = document.getElementById("feature-Income");
  const overlayFeaturePM25 = document.getElementById("feature-PM25");
  const overlayFeatureNoise = document.getElementById("feature-Noise");

  // Gestionnaire d'événement pour le clic sur la carte
  map.on("click", function (e) {
    overlayLayer.setPosition(undefined); // Cache l'overlay par défaut
    let clickedCoordinate = ol.proj.transform(
      e.coordinate,
      "EPSG:3857",
      "EPSG:4326",
    );
    // Appel à la fonction qui va récupérer les données d'exposome via l'API Django
    fetchAndDisplayExposomeData(
      clickedCoordinate[0],
      clickedCoordinate[1],
      e.coordinate,
    );
  });
}

// Fonction pour gérer la recherche par adresse (bouton "Rechercher")
async function handleSearchByAddress() {
  const searchNPA = document.getElementById("search_NPA").value;
  const searchVille = document.getElementById("search_ville").value;
  const searchAdress = document.getElementById("search_adress").value;

  document.getElementById("adresse").textContent = searchAdress;
  document.getElementById("npa_ville").textContent =
    searchNPA + "  " + searchVille;

  try {
    // Appel à l'API Django pour trouver les coordonnées
    const response = await fetch(
      `/api/find_coordinates/?address=${encodeURIComponent(searchAdress)}&npa=${encodeURIComponent(searchNPA)}&city=${encodeURIComponent(searchVille)}`,
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || "Erreur lors de la recherche des coordonnées.",
      );
    }
    const data = await response.json();
    const latitude = data.latitude;
    const longitude = data.longitude;

    // Transforme les coordonnées pour la carte OpenLayers
    const olCoordinate = ol.proj.fromLonLat([longitude, latitude]);

    // Appel à la fonction pour récupérer et afficher les données d'exposome
    fetchAndDisplayExposomeData(longitude, latitude, olCoordinate);
  } catch (error) {
    console.error("Erreur lors de la recherche d'adresse:", error);
    alert("Erreur lors de la recherche de l'adresse: " + error.message); // Utilisation temporaire d'alert pour le débogage
  }
}

// Fonction pour gérer la sélection d'un point sur la carte (bouton "Sélectionner")
function handleSearchByMapClick() {
  var draw = new ol.interaction.Draw({
    type: "Point",
  });

  map.addInteraction(draw);

  draw.on("drawend", function (evt) {
    const currentFeature = evt.feature;
    const coordinate_map_proj = currentFeature.values_.geometry.flatCoordinates;
    const coordinate_map_lonlat = ol.proj.transform(
      coordinate_map_proj,
      "EPSG:3857",
      "EPSG:4326",
    );

    map.removeInteraction(draw); // Retire l'interaction de dessin après le clic

    // Appel à la fonction pour récupérer et afficher les données d'exposome
    fetchAndDisplayExposomeData(
      coordinate_map_lonlat[0],
      coordinate_map_lonlat[1],
      coordinate_map_proj,
    );
  });
}

// Fonction principale pour récupérer et afficher les données d'exposome
async function fetchAndDisplayExposomeData(
  longitude,
  latitude,
  olCoordinateForMap,
) {
  try {
    // Appel à l'API Django pour obtenir les données d'exposome
    const response = await fetch(
      `/api/get_exposome_data/?longitude=${longitude}&latitude=${latitude}`,
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error ||
          "Erreur lors de la récupération des données d'exposome.",
      );
    }
    const data = await response.json();

    // Mise à jour de la carte
    map.getView().setCenter(olCoordinateForMap);
    map.getView().setZoom(17);

    // Supprime l'ancien marqueur si existant
    if (marker) {
      map.removeLayer(marker);
    }

    // Ajoute un nouveau marqueur
    marker = new ol.layer.Vector({
      source: new ol.source.Vector({
        features: [
          new ol.Feature({
            geometry: new ol.geom.Point(olCoordinateForMap),
          }),
        ],
      }),
      style: new ol.style.Style({
        image: new ol.style.Icon({
          src: "http://maps.google.com/mapfiles/ms/icons/red-dot.png", // Marqueur Google Maps
          anchor: [0.5, 1],
          scale: 0.8,
        }),
      }),
    });
    map.addLayer(marker);

    // Cache la couche des cantons quand on est zoomé
    layers[2].setVisible(false);

    // Affiche les informations de l'hectare et les statistiques
    document.getElementById("ndvi_value").textContent =
      `${data.hectare_data.RELI_ndvi} (Canton : ${data.canton_stats.avg_ndvi.toPrecision(3)}, Suisse : ${data.suisse_stats.ndvi})`;
    document.getElementById("income_value").textContent =
      `${data.hectare_data.RELI_income} (Canton : ${data.canton_stats.median_income.toPrecision(5)}, Suisse : ${data.suisse_stats.income})`;
    document.getElementById("noise_value").textContent =
      `${data.hectare_data.RELI_noise} (Canton : ${data.canton_stats.median_noise.toPrecision(2)}, Suisse : ${data.suisse_stats.noise})`;
    document.getElementById("pm25_value").textContent =
      `${data.hectare_data.RELI_pm25} (Canton : ${data.canton_stats.median_pm25}, Suisse : ${data.suisse_stats.pm25})`;

    // Met à jour l'overlay pour les informations de l'hectare cliqué
    const overlayContainerElement =
      document.querySelector(".overlay-container");
    const overlayLayer = map
      .getOverlays()
      .getArray()
      .find((overlay) => overlay.getElement() === overlayContainerElement);
    if (overlayLayer) {
      overlayLayer.setPosition(olCoordinateForMap);
      document.getElementById("feature-RELI").innerHTML =
        `Canton: ${data.canton}`;
      document.getElementById("feature-NDVI").innerHTML =
        `NDVI: ${data.hectare_data.RELI_ndvi}`;
      document.getElementById("feature-Income").innerHTML =
        `Revenu moyen: ${data.hectare_data.RELI_income}`;
      document.getElementById("feature-PM25").innerHTML =
        `PM 2.5: ${data.hectare_data.RELI_pm25}`;
      document.getElementById("feature-Noise").innerHTML =
        `Bruit routier: ${data.hectare_data.RELI_noise}`;
    }

    // Affiche la section de réinitialisation et cache le formulaire de recherche
    document.getElementById("form").style.visibility = "collapse";
    document.getElementById("reset").style.visibility = "visible";

    // Met à jour les graphiques Plotly
    var layout = { autosize: false, width: 400, height: 600 };

    var income_plot = [
      {
        y: data.all_data_for_plots.income,
        name: "Income [kCHF]",
        type: "box",
      },
      {
        x: ["Income [kCHF]"],
        y: [data.hectare_data.RELI_income],
        name: "Votre Hectare",
        mode: "markers",
        marker: { size: 10, color: "red" },
      },
    ];

    var ndvi_plot = [
      {
        y: data.all_data_for_plots.ndvi,
        name: "NDVI",
        pointpos: 0,
        type: "box",
      },
      {
        x: ["NDVI"],
        y: [data.hectare_data.RELI_ndvi],
        name: "Votre Hectare",
        mode: "markers",
        marker: { size: 10, color: "red" },
      },
    ];

    var noise_plot = [
      {
        y: data.all_data_for_plots.noise,
        name: "Noise [dB]",
        pointpos: 0,
        type: "box",
      },
      {
        x: ["Noise [dB]"],
        y: [data.hectare_data.RELI_noise],
        name: "Votre Hectare",
        mode: "markers",
        marker: { size: 10, color: "red" },
      },
    ];

    var pm25_plot = [
      {
        y: data.all_data_for_plots.pm25,
        name: "PM 2.5",
        pointpos: 0,
        type: "box",
      },
      {
        x: ["PM 2.5"],
        y: [data.hectare_data.RELI_pm25],
        name: "Votre Hectare",
        mode: "markers",
        marker: { size: 10, color: "red" },
      },
    ];

    Plotly.newPlot("NDVI", ndvi_plot, layout);
    Plotly.newPlot("revenu_moyen", income_plot, layout);
    Plotly.newPlot("bruit_routier", noise_plot, layout);
    Plotly.newPlot("PM_2.5", pm25_plot, layout);
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des données d'exposome:",
      error,
    );
    alert("Erreur lors de la récupération des données: " + error.message); // Utilisation temporaire d'alert pour le débogage
    reinitialise(); // Réinitialise l'interface en cas d'erreur
  }
}

// Fonction pour réinitialiser l'interface
function reinitialise() {
  $("#search_NPA").val("");
  $("#search_ville").val("");
  $("#search_adress").val("");

  document.getElementById("form").style.visibility = "visible";
  document.getElementById("reset").style.visibility = "collapse";

  // Réinitialise les graphiques Plotly à vide
  var blank = [
    {
      y: [],
      name: "NDVI",
      pointpos: 0,
      type: "box",
    },
  ];
  var layout = { autosize: false, width: 400, height: 600 };
  Plotly.newPlot("NDVI", blank, layout);
  Plotly.newPlot("revenu_moyen", blank, layout);
  Plotly.newPlot("bruit_routier", blank, layout);
  Plotly.newPlot("PM_2.5", blank, layout);

  // Réinitialise la vue de la carte
  map.getView().setCenter(ol.proj.fromLonLat([8, 46.5]));
  map.getView().setZoom(7);
  if (marker) {
    map.removeLayer(marker); // Supprime le marqueur
  }

  // Rend les couches de canton visibles et cache les couches d'hectares
  layers[2].setVisible(true); // Couche des cantons
  for (let i = 3; i < layers.length; i++) {
    // Toutes les couches d'hectares
    layers[i].setVisible(false);
  }

  // Cache l'overlay
  const overlayContainerElement = document.querySelector(".overlay-container");
  const overlayLayer = map
    .getOverlays()
    .getArray()
    .find((overlay) => overlay.getElement() === overlayContainerElement);
  if (overlayLayer) {
    overlayLayer.setPosition(undefined);
  }
}

// Fonction pour ajouter toutes les couches d'hectares par canton
function addHectareLayers(HectareStyle) {
  const cantons = [
    "vaud",
    "geneve",
    "jura",
    "neuchatel",
    "fribourg",
    "bern",
    "basel",
    "solothurn",
    "valais",
    "graubunden",
    "ticino",
    "uri",
    "schwyz",
    "glarus",
    "aargau",
    "luzern",
    "nidwalden",
    "obwalden",
    "zug",
    "zurich",
    "schaffhausen",
    "thurgau",
    "st_gallen",
    "appenzell_ausser",
    "appenzell_inner",
  ];

  cantons.forEach((canton) => {
    var hectareLayer = new ol.layer.Vector({
      style: HectareStyle,
      source: new ol.source.Vector({
        url: `/geojson/hectares/hectare_${canton}.geojson`, // Chemin vers le fichier GeoJSON de l'hectare
        format: new ol.format.GeoJSON(),
      }),
      visible: false, // Initialement invisible
      title: "Hectares",
    });
    layers.push(hectareLayer);
  });
}
