// Wait for the page to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. SET UP YOUR API KEY ---
    // We still need this for AQI and as our PRIMARY weather source.
    const openWeatherKey = "57a901bca3ad8c62c24e0864787112d8"; 

    // --- 2. GET REFERENCES TO HTML ELEMENTS ---
    const cityInput = document.getElementById("city-input");
    const searchButton = document.getElementById("search-btn");
    const locationButton = document.getElementById("location-btn");
    
    // Local Widget Containers
    const weatherResultDiv = document.getElementById("weather-result");
    const alertContainer = document.getElementById("alert-container");
    const aqiResultDiv = document.getElementById("aqi-result");
    const riskForecastDiv = document.getElementById("risk-forecast");
    const proximityAlertContainer = document.getElementById("proximity-alert-container");
    
    // Global Widget Containers
    const earthquakeList = document.getElementById("earthquake-list");
    const eonetList = document.getElementById("eonet-list");

    // --- 3. GLOBAL VARIABLE TO STORE EVENTS ---
    let globalEvents = []; 

    // --- 4. ATTACH EVENT LISTENERS ---
    searchButton.addEventListener("click", () => {
        const city = cityInput.value;
        if (city) {
            clearLocalData();
            // Start the NEW geocoding process
            getCoordinates_Advanced(city);
        }
    });

    locationButton.addEventListener("click", () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(onSuccess, onError);
        } else {
            alert("Your browser does not support geolocation.");
        }
    });

    // Helper to clear all old data
    function clearLocalData() {
        weatherResultDiv.innerHTML = "";
        alertContainer.innerHTML = "";
        aqiResultDiv.innerHTML = "";
        riskForecastDiv.innerHTML = "";
        proximityAlertContainer.innerHTML = "";
    }

    // Geolocation Success
    function onSuccess(position) {
        clearLocalData();
        const { latitude: lat, longitude: lon } = position.coords;

        // Run all local fetches
        runAllFetches(lat, lon, "Your Location");
    }

    // Geolocation Error
    function onError(error) {
        alert("Unable to retrieve your location. Please search manually.");
    }

    // --- 5. NEW, ADVANCED API CHAIN ---

    // STEP 1: Get Lat/Lon (Using free Nominatim geocoding)
    async function getCoordinates_Advanced(city) {
        weatherResultDiv.innerHTML = `<p>Searching for "${city}"...</p>`;
        
        try {
            // Use Nominatim (OpenStreetMap) - completely free, no API key needed
            const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
            
            console.log("Geocoding:", city);
            
            // Add a small delay to respect rate limits (1 request per second)
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const response = await fetch(geocodeUrl, {
                headers: {
                    'User-Agent': 'DisasterDashboard/1.0'
                }
            });
            
            console.log("Response status:", response.status);
            
            if (!response.ok) {
                throw new Error(`Geocoding failed with status ${response.status}`);
            }
            
            const data = await response.json();
            console.log("Geocoding data:", data);
            
            if (data.length === 0) {
                throw new Error(`Location not found: "${city}". Try being more specific (e.g., "London, UK")`);
            }
            
            const { lat, lon, display_name } = data[0];
            console.log("Found:", lat, lon, display_name);
            
            // Run all our data fetches using these coordinates
            runAllFetches(parseFloat(lat), parseFloat(lon), display_name);

        } catch (error) {
            console.error("Geocoding error:", error);
            weatherResultDiv.innerHTML = `<p class="alert-warning">Could not find location: "${city}".<br>Please try a different search (e.g., "New York, USA" or "Tokyo, Japan")</p>`;
        }
    }
    
    // Fallback geocoding method
    async function tryFallbackGeocoding(city) {
        // This function is no longer needed but kept for compatibility
        weatherResultDiv.innerHTML = `<p class="alert-warning">Could not find location: "${city}".</p>`;
    }
    
    // STEP 2: Run all fetches for the local widget
    function runAllFetches(lat, lon, name) {
        // We use the coordinates to fetch everything
        
        // Fetch Primary Weather (OWM) with a Fallback (Open-Meteo)
        getWeather_WithFallback(lat, lon, name); 
        
        // Fetch AQI (Only OWM has this)
        getAQIData(lat, lon); 
        
        // Fetch Risk Forecast (This will also use the fallback)
        getForecast_WithFallback(lat, lon); 
        
        // Fetch NWS Alerts (US Only)
        getLocalAlerts(lat, lon); 
        
        // Check Proximity
        checkProximity(lat, lon);
    }

    // STEP 3a: Get Weather (Primary + Fallback)
    async function getWeather_WithFallback(lat, lon, cityName) {
        try {
            // --- TRY PRIMARY: OPENWEATHERMAP ---
            const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherKey}&units=metric`;
            const response = await fetch(weatherUrl);
            if (!response.ok) {
                // If OWM fails (e.g., key error), this will throw and trigger the CATCH block
                throw new Error("OWM weather failed. Trying fallback...");
            }
            const data = await response.json();
            displayWeather(data, cityName);
        } catch (error) {
            // --- CATCH AND TRY FALLBACK: OPEN-METEO ---
            console.warn(error.message); // Log the error for us to see
            
            // This is a free, keyless weather API.
            const fallbackUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;
            
            try {
                const fallbackResponse = await fetch(fallbackUrl);
                const fallbackData = await fallbackResponse.json();
                // Display the weather from the fallback source
                displayWeather_Fallback(fallbackData, cityName);
            } catch (fallbackError) {
                weatherResultDiv.innerHTML = `<p class="alert-warning">Both primary and fallback weather failed.</p>`;
            }
        }
    }

    // STEP 3b: Get Forecast (Primary + Fallback)
    async function getForecast_WithFallback(lat, lon) {
        try {
            // --- TRY PRIMARY: OPENWEATHERMAP ---
            const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${openWeatherKey}&units=metric`;
            const response = await fetch(forecastUrl);
            if (!response.ok) throw new Error("OWM forecast failed. Trying fallback...");
            const data = await response.json();
            analyzeRisk(data.list);
        } catch (error) {
            // --- CATCH AND TRY FALLBACK: OPEN-METEO ---
            console.warn(error.message);
            
            const fallbackUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max,precipitation_probability_max`;
            
            try {
                const fallbackResponse = await fetch(fallbackUrl);
                const fallbackData = await fallbackResponse.json();
                analyzeRisk_Fallback(fallbackData.daily);
            } catch (fallbackError) {
                riskForecastDiv.innerHTML = `<p>Risk forecast data not available.</p>`;
            }
        }
    }

    // STEP 3c: Get AQI (OWM Only - no fallback)
    async function getAQIData(lat, lon) {
        const aqiUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${openWeatherKey}`;
        try {
            const response = await fetch(aqiUrl);
            if (!response.ok) throw new Error("AQI data failed");
            const data = await response.json();
            displayAQI(data.list[0]);
        } catch (error) {
            aqiResultDiv.innerHTML = `<p>AQI data not available.</p>`;
        }
    }
    
    // STEP 3d: Get NWS Alerts (US Only - no fallback)
    async function getLocalAlerts(lat, lon) {
        // (This function is unchanged)
        try {
            const pointsResponse = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
            if (!pointsResponse.ok) throw new Error("NWS points data not for this region.");
            const pointsData = await pointsResponse.json();
            const alertsUrl = pointsData.properties.forecastZone; 
            const alertsResponse = await fetch(`${alertsUrl}/alerts`);
            if (!alertsResponse.ok) throw new Error("Could not fetch NWS alerts.");
            const alertData = await alertsResponse.json();
            if (alertData.features.length === 0) {
                alertContainer.innerHTML = `<p class="alert-safe">✅ No active NWS alerts for this area.</p>`;
                return;
            }
            displayAlerts(alertData.features);
        } catch (error) {
            alertContainer.innerHTML = `<p class="alert-safe">✅ No active NWS alerts found for this location.</p>`;
        }
    }

    // --- 6. ALL DISPLAY FUNCTIONS ---

    // Displays OWM Weather
    function displayWeather(data, cityName) {
        weatherResultDiv.innerHTML = `
            <h3>Weather in ${cityName.split(',')[0]}</h3> <p><strong>Temperature:</strong> ${data.main.temp}°C</p>
            <p><strong>Conditions:</strong> ${data.weather[0].description}</p>
            <p><strong>Wind Speed:</strong> ${data.wind.speed} m/s</p>
            <p><strong>Humidity:</strong> ${data.main.humidity}%</p>
            <small>(Source: OpenWeatherMap)</small>
        `;
    }

    // NEW: Displays Open-Meteo Weather (Fallback)
    function displayWeather_Fallback(data, cityName) {
        weatherResultDiv.innerHTML = `
            <h3>Weather in ${cityName.split(',')[0]}</h3> <p><strong>Temperature:</strong> ${data.current.temperature_2m}°C</p>
            <p><strong>Conditions:</strong> ${getWeatherDescription(data.current.weather_code)}</p>
            <p><strong>Wind Speed:</strong> ${data.current.wind_speed_10m} km/h</p>
            <p><strong>Humidity:</strong> ${data.current.relative_humidity_2m}%</p>
            <small>(Source: Open-Meteo)</small>
        `;
    }
    
    // (displayAlerts and displayAQI are unchanged)
    function displayAlerts(alerts) {
        const alert = alerts[0];
        alertContainer.innerHTML = `<div class="alert-warning"><h3>⚠️ ${alert.properties.event}</h3><p>${alert.properties.headline}</p></div>`;
    }
    function displayAQI(pollution) {
        const aqi = pollution.main.aqi;
        const pm2_5 = pollution.components.pm2_5;
        let aqiText = "";
        switch (aqi) {
            case 1: aqiText = "Good"; break;
            case 2: aqiText = "Fair"; break;
            case 3: aqiText = "Moderate"; break;
            case 4: aqiText = "Poor"; break;
            case 5: aqiText = "Very Poor"; break;
            default: aqiText = "Unknown";
        }
        aqiResultDiv.innerHTML = `<h3>Air Quality Index (AQI)</h3><div class="aqi-container aqi-${aqi}"><p class="aqi-level">${aqiText}</p><strong>PM2.5: ${pm2_5} μg/m³</strong></div>`;
    }

    // Analyzes OWM Risk
    function analyzeRisk(forecastList) {
        let highHeatDays = 0, highRainDays = 0;
        const dailyForecasts = forecastList.filter(item => item.dt_txt.includes("12:00:00"));
        const nextThreeDays = dailyForecasts.slice(0, 3);
        
        nextThreeDays.forEach(day => {
            if (day.main.temp > 30 && day.main.humidity < 20 && day.wind.speed > 5) highHeatDays++;
            if (day.weather[0].main === "Rain" && day.pop > 0.8) highRainDays++;
        });
        displayRisk(highHeatDays, highRainDays);
    }

    // NEW: Analyzes Open-Meteo Risk (Fallback)
    function analyzeRisk_Fallback(daily) {
        let highHeatDays = 0, highRainDays = 0;
        // We just need to get the next 3 days from the arrays
        const nextThreeDays = daily.time.slice(1, 4).map((time, index) => ({
            temp: daily.temperature_2m_max[index + 1],
            humidity: daily.relative_humidity_2m_mean[index + 1],
            wind: daily.wind_speed_10m_max[index + 1],
            rain_prob: daily.precipitation_probability_max[index + 1],
        }));

        nextThreeDays.forEach(day => {
            if (day.temp > 30 && day.humidity < 20 && day.wind > (5 * 3.6)) highHeatDays++; // O-M is in km/h, OWM was m/s
            if (day.rain_prob > 80) highRainDays++;
        });
        displayRisk(highHeatDays, highRainDays);
    }

    // NEW: Shared function to display the risk
    function displayRisk(highHeatDays, highRainDays) {
        if (highHeatDays >= 2) {
            riskForecastDiv.innerHTML = `<div class="risk-warning risk-fire"><strong>Risk Forecast:</strong> Elevated fire risk detected in the next 3 days.</div>`;
        } else if (highRainDays >= 2) {
            riskForecastDiv.innerHTML = `<div class="risk-warning risk-flood"><strong>Risk Forecast:</strong> Potential flood risk detected in the next 3 days.</div>`;
        } else {
            riskForecastDiv.innerHTML = `<p class="alert-safe">✅ No immediate high-risk weather patterns detected in the 3-day forecast.</p>`;
        }
    }

    // --- 7. PROXIMITY ALERT FUNCTIONS (Unchanged) ---
    function getDistanceInKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 0.5 - Math.cos(dLat)/2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * (1 - Math.cos(dLon)) / 2;
        return R * 2 * Math.asin(Math.sqrt(a));
    }
    function checkProximity(userLat, userLon) {
        const alertRadiusKm = 250;
        let nearbyEvents = [];
        globalEvents.forEach(event => {
            const distance = getDistanceInKm(userLat, userLon, event.lat, event.lon);
            if (distance <= alertRadiusKm) {
                nearbyEvents.push({ title: event.title, distance: distance.toFixed(0) });
            }
        });
        if (nearbyEvents.length > 0) {
            const event = nearbyEvents[0];
            proximityAlertContainer.innerHTML = `<div class="proximity-alert"><p>⚠️ <strong>Proximity Alert:</strong> A [${event.title}] has been reported ${event.distance} km from your location!</p></div>`;
        }
    }

    // --- 8. GLOBAL EVENT FUNCTIONS (Unchanged, but I added helper) ---
    async function getEonetEvents() {
        const eonetUrl = "https://eonet.gsfc.nasa.gov/api/v3/events?limit=10&status=open&categories=wildfires,volcanoes";
        try {
            const response = await fetch(eonetUrl);
            const data = await response.json();
            eonetList.innerHTML = ""; 
            data.events.forEach(event => {
                const li = document.createElement("li");
                const category = event.categories[0].title;
                const title = `[${category}] ${event.title}`;
                li.textContent = title;
                eonetList.appendChild(li);
                globalEvents.push({ title: title, lat: event.geometry[0].coordinates[1], lon: event.geometry[0].coordinates[0] });
            });
        } catch (error) { eonetList.innerHTML = "<li>Could not load event data.</li>"; }
    }
    async function getUsgsEvents() {
        const usgsUrl = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
        try {
            const response = await fetch(usgsUrl);
            const data = await response.json();
            earthquakeList.innerHTML = "";
            const topQuakes = data.features.sort((a, b) => b.properties.mag - a.properties.mag).slice(0, 5);
            topQuakes.forEach(event => {
                const li = document.createElement("li");
                const mag = event.properties.mag.toFixed(1);
                const place = event.properties.place;
                const title = `[Mag ${mag}] ${place}`;
                li.textContent = title;
                earthquakeList.appendChild(li);
                globalEvents.push({ title: title, lat: event.geometry.coordinates[1], lon: event.geometry.coordinates[0] });
            });
        } catch (error) { earthquakeList.innerHTML = "<li>Could not load earthquake data.</li>"; }
    }
    
    // NEW HELPER for Weather Codes
    function getWeatherDescription(code) {
        const codes = {
            0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
            45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
            56: "Light freezing drizzle", 57: "Dense freezing drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
            66: "Light freezing rain", 67: "Heavy freezing rain", 71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
            77: "Snow grains", 80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
            85: "Slight snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
        };
        return codes[code] || "Unknown conditions";
    }

    // --- 9. RUN GLOBAL FUNCTIONS & AUTO-REFRESH ---
    function refreshGlobalData() {
        console.log("Auto-refreshing global event data...");
        globalEvents = [];
        getEonetEvents();
        getUsgsEvents();
    }
    refreshGlobalData();
    setInterval(refreshGlobalData, 600000);

});