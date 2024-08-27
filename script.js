let map;
const OPENWEATHERMAP_API_KEY = '03e0d9f4f1785d95c3b4f691f0ea5b03';

let currentGpxData = null; // Declare this at the top of your script, outside any function

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const stateParam = urlParams.get('state');

    if (stateParam) {
        const state = JSON.parse(decodeURIComponent(stateParam));
        currentGpxData = state.gpxData; // Set the current GPX data
        // Populate form fields with state data
        document.getElementById('startDate').value = state.startDate;
        document.getElementById('startTime').value = state.startTime;
        document.getElementById('avgSpeed').value = state.avgSpeed;
        document.getElementById('coffeeStop1').value = state.coffeeStop1;
        document.getElementById('coffeeStopDuration1').value = state.coffeeStopDuration1;
        document.getElementById('coffeeStop2').value = state.coffeeStop2;
        document.getElementById('coffeeStopDuration2').value = state.coffeeStopDuration2;

        // Display the GPX data
        displayGPXonMap(state.gpxData, state.startDate, state.startTime, parseFloat(state.avgSpeed), 
                        parseFloat(state.coffeeStop1), parseInt(state.coffeeStopDuration1), 
                        parseFloat(state.coffeeStop2), parseInt(state.coffeeStopDuration2));
    }

    initializeMap();
    var fileInput = document.getElementById('gpxFile');
    var uploadButton = document.getElementById('uploadButton');
    var fileInfo = document.getElementById('fileInfo');
    var startDateInput = document.getElementById('startDate');
    var startTimeInput = document.getElementById('startTime');
    var avgSpeedInput = document.getElementById('avgSpeed');
    var mapContainer = document.getElementById('map');

    console.log('DOM loaded');

    var addCoffeeStopButton = document.getElementById('addCoffeeStop');
    var secondCoffeeStop = document.getElementById('secondCoffeeStop');
    
    addCoffeeStopButton.addEventListener('click', function() {
        secondCoffeeStop.style.display = 'block';
        addCoffeeStopButton.style.display = 'none';
    });

    uploadButton.addEventListener('click', function() {
        console.log('Upload button clicked');
        var file = fileInput.files[0];
        var startDate = startDateInput.value;
        var startTime = startTimeInput.value;
        var avgSpeed = parseFloat(avgSpeedInput.value);
        var coffeeStop1 = parseFloat(document.getElementById('coffeeStop1').value) || 0;
        var coffeeStopDuration1 = parseInt(document.getElementById('coffeeStopDuration1').value) || 0;
        var coffeeStop2 = parseFloat(document.getElementById('coffeeStop2').value) || 0;
        var coffeeStopDuration2 = parseInt(document.getElementById('coffeeStopDuration2').value) || 0;

        if (file && startDate && startTime && !isNaN(avgSpeed)) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var gpxData = e.target.result;
                console.log('File content:', gpxData.substring(0, 200)); // Log the first 200 characters
                displayGPXonMap(gpxData, startDate, startTime, avgSpeed, coffeeStop1, coffeeStopDuration1, coffeeStop2, coffeeStopDuration2);
            };
            reader.readAsText(file);
        } else {
            fileInfo.textContent = 'Please fill in all required fields and select a file.';
        }
    });

    document.getElementById('shareButton').addEventListener('click', createShareLink);
    document.getElementById('downloadButton').addEventListener('click', downloadGPX);
});

function initializeMap() {
    if (typeof L !== 'undefined') {
        map = L.map('map').setView([0, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
    } else {
        console.error('Leaflet is not loaded');
    }
}

async function fetchWeather(lat, lon, startTimestamp, endTimestamp) {
    console.log('Fetching weather', {lat: lat, lon: lon, startTimestamp: startTimestamp, endTimestamp: endTimestamp});
    var url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_API_KEY}&units=metric`;
    var response = await fetch(url);
    if (!response.ok) {
        throw new Error('HTTP error! status: ' + response.status);
    }
    var data = await response.json();
    
    var forecasts = data.list.filter(forecast => 
        forecast.dt >= startTimestamp && forecast.dt <= endTimestamp
    );

    return forecasts;
}

function displayGPXonMap(gpxData, startDate, startTime, avgSpeed, coffeeStop1, coffeeStopDuration1, coffeeStop2, coffeeStopDuration2) {
    currentGpxData = gpxData; // Store the GPX data
    console.log('Displaying GPX on map', {startDate, startTime, avgSpeed, coffeeStop1, coffeeStopDuration1, coffeeStop2, coffeeStopDuration2});
    
    if (!map) {
        console.error('Map is not initialized');
        return;
    }

    // Clear existing layers
    map.eachLayer(function(layer) {
        if (!(layer instanceof L.TileLayer)) {
            map.removeLayer(layer);
        }
    });

    try {
        // Parse the XML data
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(gpxData, "text/xml");
        var trackpoints = xmlDoc.getElementsByTagName("trkpt");
        var points = [];
        var totalDistance = 0;
        var lastPoint = null;

        for (var i = 0; i < trackpoints.length; i++) {
            var lat = parseFloat(trackpoints[i].getAttribute("lat"));
            var lon = parseFloat(trackpoints[i].getAttribute("lon"));
            if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
                var point = L.latLng(lat, lon);
                points.push(point);

                if (lastPoint) {
                    totalDistance += lastPoint.distanceTo(point);
                }
                lastPoint = point;
            }
        }

        console.log('Parsed points:', points.length);

        if (points.length < 2) {
            throw new Error('Not enough valid points in GPX data');
        }

        // Create a polyline from the points
        var polyline = L.polyline(points, {
            color: 'blue',
            opacity: 0.75,
            weight: 3
        }).addTo(map);

        // Fit the map to the polyline bounds
        var bounds = polyline.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds);
        } else {
            console.warn('Invalid bounds, centering on first point');
            map.setView(points[0], 13);
        }

        var startDateTime = new Date(startDate + 'T' + startTime);
        var totalDistanceKm = totalDistance / 1000; // Convert to km
        var estimatedDuration = totalDistanceKm / avgSpeed; // in hours
        if (coffeeStopDuration1 > 0) {
            estimatedDuration += coffeeStopDuration1 / 60; // Add coffee stop duration in hours
        }
        if (coffeeStopDuration2 > 0) {
            estimatedDuration += coffeeStopDuration2 / 60; // Add coffee stop duration in hours
        }
        var endDateTime = new Date(startDateTime.getTime() + estimatedDuration * 60 * 60 * 1000);

        let windDirections = []; // Array to store wind directions

        fetchWeather(points[0].lat, points[0].lng, startDateTime.getTime() / 1000, endDateTime.getTime() / 1000)
            .then(function(forecasts) {
                console.log('Received forecasts:', forecasts);
                // Add weather icons and wind arrows
                for (let i = 0; i <= 10; i++) {
                    let index = Math.min(Math.floor(points.length * (i / 10)), points.length - 1);
                    let point = points[index];
                    
                    if (point && point.lat && point.lng) {
                        // Calculate estimated time for this point
                        let distanceToPoint = totalDistance * (i / 10) / 1000; // in km
                        let timeToPoint = distanceToPoint / avgSpeed; // in hours
                        let pointDateTime = new Date(startDateTime.getTime() + timeToPoint * 60 * 60 * 1000);

                        // Find the closest forecast for this time
                        let closestForecast = forecasts.reduce((prev, curr) => 
                            Math.abs(curr.dt * 1000 - pointDateTime.getTime()) < Math.abs(prev.dt * 1000 - pointDateTime.getTime()) ? curr : prev
                        );

                        console.log(`Point ${i}:`, point, 'Forecast:', closestForecast);

                        let weatherIconClass = getWeatherIconClass(closestForecast.weather[0].main);
                        
                        // Skip first and last points (2km away from start/end)
                        if (i !== 0 && i !== 10) {
                            let weatherMarker = L.marker(point, {
                                icon: L.divIcon({
                                    html: `<i class="fas fa-cloud-sun weather-icon ${weatherIconClass}"></i>`,
                                    className: 'custom-icon',
                                    iconSize: [30, 30],
                                    iconAnchor: [15, 15]
                                })
                            }).addTo(map);

                            // Add popup to weather icon
                            weatherMarker.bindPopup(`
                                <strong>Weather at ${pointDateTime.toLocaleTimeString()}</strong><br>
                                Temperature: ${closestForecast.main.temp}°C<br>
                                Conditions: ${closestForecast.weather[0].description}<br>
                                Wind: ${closestForecast.wind.speed.toFixed(1)} km/h, ${degreesToCardinal(closestForecast.wind.deg)}
                            `);
                        }

                        // Store wind direction
                        windDirections.push(closestForecast.wind.deg);

                        // Add animated wind line
                        if (closestForecast.wind.speed > 0) {
                            // Calculate offset point (5km perpendicular to the route)
                            let nextIndex = Math.min(index + 1, points.length - 1);
                            let nextPoint = points[nextIndex];
                            let bearing = calculateBearing(point, nextPoint);
                            let perpendicularBearing = (bearing + 90) % 360;
                            let offsetPoint = calculateDestination(point, perpendicularBearing, 5); // 5 km offset

                            // Calculate wind arrow end point
                            let arrowEnd = calculateDestination(offsetPoint, closestForecast.wind.deg, 1); // 1 km long arrow

                            if (arrowEnd && arrowEnd.lat && arrowEnd.lng) {
                                let windLine = L.polyline([offsetPoint, arrowEnd], {
                                    color: 'white',
                                    weight: 3,
                                    opacity: 0.9,
                                    className: 'wind-line'
                                }).addTo(map);

                                // Calculate the length of the line
                                let length = map.latLngToLayerPoint(offsetPoint).distanceTo(map.latLngToLayerPoint(arrowEnd));

                                // Set the dash pattern based on the length
                                windLine.setStyle({
                                    dashArray: `${length}px`,
                                    dashOffset: `${length}px`
                                });

                                // Add arrowhead
                                L.polylineDecorator(windLine, {
                                    patterns: [
                                        {offset: '100%', repeat: 0, symbol: L.Symbol.arrowHead({pixelSize: 20, polygon: false, pathOptions: {stroke: true, color: 'white', weight: 3}})}
                                    ]
                                }).addTo(map);
                            }
                        } else {
                            console.log(`No wind at point ${i}`);
                        }
                    } else {
                        console.warn(`Invalid point at index ${index}:`, point);
                    }
                }

                // Update the popup content with start weather info
                let startForecast = forecasts[0];
                let willGetWet = forecasts.some(forecast => 
                    forecast.rain && forecast.rain['3h'] > 0 || 
                    forecast.weather[0].main.toLowerCase().includes('rain')
                );

                L.popup({
                    closeButton: true,
                    autoClose: false,
                    closeOnClick: false
                })
                .setLatLng(points[0])
                .setContent(`
                    <strong>Route Start:</strong><br>
                    Date: ${startDateTime.toLocaleDateString()}<br>
                    Time: ${startDateTime.toLocaleTimeString()}<br>
                    <strong>Weather at Start:</strong><br>
                    Temperature: ${startForecast.main.temp}°C<br>
                    Conditions: ${startForecast.weather[0].description}<br>
                    Wind: ${startForecast.wind.speed.toFixed(1)} km/h, ${degreesToCardinal(startForecast.wind.deg)}<br>
                    <strong>Ride Details:</strong><br>
                    Estimated End Time: ${endDateTime.toLocaleString()}<br>
                    Total Distance: ${totalDistanceKm.toFixed(2)} km<br>
                    ${coffeeStop1 ? `Coffee Stop 1: At ${coffeeStop1.toFixed(1)} km (${coffeeStopDuration1} min break)<br>` : ''}
                    ${coffeeStop2 ? `Coffee Stop 2: At ${coffeeStop2.toFixed(1)} km (${coffeeStopDuration2} min break)<br>` : ''}
                    <strong>Weather Forecast:</strong><br>
                    Weather icons along the route show the forecasted conditions during your ride.<br>
                    Will you get wet? ${willGetWet ? 'Yes, prepare for rain!' : 'No rain expected during your ride.'}
                `)
                .openOn(map);
            })
            .catch(function(error) {
                console.error('Error fetching weather:', error);
                fileInfo.textContent = 'Error fetching weather data. Please try again.';
            });

        // Calculate coffee stop locations
        let coffeeStop1Index = -1;
        let coffeeStop1Point = null;
        if (coffeeStop1 > 0) {
            let accumulatedDistance = 0;
            for (let i = 1; i < points.length; i++) {
                accumulatedDistance += points[i-1].distanceTo(points[i]) / 1000; // Convert to km
                if (accumulatedDistance >= coffeeStop1) {
                    coffeeStop1Index = i;
                    coffeeStop1Point = points[i];
                    break;
                }
            }
        }

        let coffeeStop2Index = -1;
        let coffeeStop2Point = null;
        if (coffeeStop2 > 0) {
            let accumulatedDistance = 0;
            for (let i = 1; i < points.length; i++) {
                accumulatedDistance += points[i-1].distanceTo(points[i]) / 1000; // Convert to km
                if (accumulatedDistance >= coffeeStop2) {
                    coffeeStop2Index = i;
                    coffeeStop2Point = points[i];
                    break;
                }
            }
        }

        // Add start and end markers
        var startPoint = points[0];
        var endPoint = points[points.length - 1];

        L.marker(startPoint, {
            icon: L.divIcon({
                html: '<i class="fa-solid fa-play"></i>',
                className: 'custom-icon start-icon',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(map);

        L.marker(endPoint, {
            icon: L.divIcon({
                html: '<i class="fa-solid fa-flag-checkered"></i>',
                className: 'custom-icon end-icon',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(map);

        // Add coffee stop markers if applicable
        if (coffeeStop1Point) {
            L.marker(coffeeStop1Point, {
                icon: L.divIcon({
                    html: '<i class="fas fa-mug-hot"></i>',
                    className: 'custom-icon coffee-icon',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                })
            }).addTo(map);
        }
        if (coffeeStop2Point) {
            L.marker(coffeeStop2Point, {
                icon: L.divIcon({
                    html: '<i class="fas fa-mug-hot"></i>',
                    className: 'custom-icon coffee-icon',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                })
            }).addTo(map);
        }

        console.log('GPX loaded and bounds set');
    } catch (error) {
        console.error('Error displaying GPX:', error);
        fileInfo.textContent = 'Error displaying GPX data: ' + error.message;
    }
}

// Helper function to calculate destination point given start point, initial bearing, and distance
function calculateDestination(start, bearing, distance) {
    if (!start || typeof start.lat !== 'number' || typeof start.lng !== 'number') {
        console.warn('Invalid start point:', start);
        return null;
    }

    const R = 6371; // Earth's radius in km
    const d = distance / R;  // angular distance in radians
    const lat1 = start.lat * Math.PI / 180;
    const lon1 = start.lng * Math.PI / 180;
    const brng = bearing * Math.PI / 180;

    let lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    let lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));

    lat2 = lat2 * 180 / Math.PI;
    lon2 = lon2 * 180 / Math.PI;

    return L.latLng(lat2, lon2);
}

function getWeatherIconClass(weatherCondition) {
    switch(weatherCondition.toLowerCase()) {
        case 'clear':
            return 'sunny';
        case 'clouds':
            return 'cloudy';
        case 'rain':
        case 'drizzle':
        case 'thunderstorm':
            return 'rainy';
        default:
            return 'cloudy'; // Default to cloudy if condition is unknown
    }
}

// Helper function to calculate bearing between two points
function calculateBearing(start, end) {
    const startLat = start.lat * Math.PI / 180;
    const startLng = start.lng * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLng = end.lng * Math.PI / 180;

    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
              Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}

function degreesToCardinal(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

function createShareLink() {
    if (!currentGpxData) {
        alert('Please upload a GPX file first.');
        return;
    }

    const state = {
        gpxData: currentGpxData,
        startDate: document.getElementById('startDate').value,
        startTime: document.getElementById('startTime').value,
        avgSpeed: document.getElementById('avgSpeed').value,
        coffeeStop1: document.getElementById('coffeeStop1').value,
        coffeeStopDuration1: document.getElementById('coffeeStopDuration1').value,
        coffeeStop2: document.getElementById('coffeeStop2').value,
        coffeeStopDuration2: document.getElementById('coffeeStopDuration2').value
    };

    const encodedState = encodeURIComponent(JSON.stringify(state));
    const shareUrl = `${window.location.origin}${window.location.pathname}?state=${encodedState}`;

    // Create a temporary input to copy the URL
    const tempInput = document.createElement('input');
    tempInput.value = shareUrl;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);

    alert('Share link copied to clipboard!');
}

function downloadGPX() {
    if (!currentGpxData) {
        alert('No GPX data available to download.');
        return;
    }

    const blob = new Blob([currentGpxData], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'route.gpx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
}