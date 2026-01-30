
const openCameraBtn = document.getElementById('openCameraBtn');
const captureBtn = document.getElementById('captureBtn');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');

let cameraStream = null;


// Camera functionality



openCameraBtn.addEventListener('click', async () => {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = cameraStream;
        video.style.display = 'block';
        captureBtn.style.display = 'inline-block';
    } catch (err) {
        alert('Camera access denied or unavailable');
    }
});
captureBtn.addEventListener('click', () => {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
        const file = new File([blob], 'captured.jpg', { type: 'image/jpeg' });
        handleImageUpload(file); // uses your existing upload logic
    }, 'image/jpeg');

    cameraStream.getTracks().forEach(track => track.stop());
    video.style.display = 'none';
    captureBtn.style.display = 'none';
});
// Global variables
let map;
let marker, circle;
let userCoordinates = { lat: null, lng: null };
let uploadedFilename = null;
// Layer to hold report markers (red) and an id->marker mapping
let reportsLayer = null;
let reportMarkers = {};

const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, @ Made By Team Origin With <3';

// ========== STEP 1: IMAGE UPLOAD ==========
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const uploadStatus = document.getElementById('uploadStatus');
const previewImage = document.getElementById('previewImage');
const nextBtn = document.getElementById('nextBtn');

// Click to upload
uploadArea.addEventListener('click', () => imageInput.click());
openCameraBtn.addEventListener('click', async () => {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = cameraStream;
        video.style.display = 'block';
        captureBtn.style.display = 'inline-block';
    } catch (err) {
        alert('Camera access denied or unavailable');
    }
});
captureBtn.addEventListener('click', () => {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
        const file = new File([blob], 'captured.jpg', { type: 'image/jpeg' });
        handleImageUpload(file); // uses your existing upload logic
    }, 'image/jpeg');

    cameraStream.getTracks().forEach(track => track.stop());
    video.style.display = 'none';
    captureBtn.style.display = 'none';
});
// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.backgroundColor = '#e0e0e0';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.backgroundColor = '#f9f9f9';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.backgroundColor = '#f9f9f9';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleImageUpload(files[0]);
    }
});

// File input change
imageInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleImageUpload(e.target.files[0]);
    }
});

function handleImageUpload(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];

    if (!validTypes.includes(file.type)) {
        uploadStatus.innerHTML = '<p style="color: red;">Please upload a valid image file (JPG or PNG)</p>';
        return;
    }

    uploadStatus.innerHTML = '<p>Uploading...</p>';

    const formData = new FormData();
    formData.append('image', file);

    fetch('/upload-image', {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                uploadedFilename = data.filename;
                uploadStatus.innerHTML = '<p style="color: green;">Image uploaded successfully!</p>';

                // Show preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImage.src = e.target.result;
                    previewImage.style.display = 'block';
                };
                reader.readAsDataURL(file);

                nextBtn.style.display = 'block';
            } else {
                uploadStatus.innerHTML = `<p style="color: red;">Error: ${data.message}</p>`;
            }
        })
        .catch(error => {
            uploadStatus.innerHTML = `<p style="color: red;">Upload failed: ${error}</p>`;
        });
}

// Next button - go to map section
nextBtn.addEventListener('click', () => {
    document.getElementById('uploadSection').classList.remove('active');
    document.getElementById('mapSection').classList.add('active');
    document.getElementById('mapSection').style.display = 'block';

    // Ensure selection map is clean: remove any report markers if they exist
    if (map && reportsLayer) {
        reportsLayer.clearLayers();
        try { map.removeLayer(reportsLayer); } catch (e) { }
        reportsLayer = null;
        reportMarkers = {};
    }

    // Get user's location before initializing map
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setTimeout(() => {
                if (!map) {
                    initMap(lat, lng);
                }
            }, 100);
        },
        (err) => {
            // Fallback to default location if geolocation fails
            console.log('Geolocation not available, using default location');
            setTimeout(() => {
                if (!map) {
                    initMap(28.7041, 77.1025); // Default to Delhi
                }
            }, 100);
        }
    );
});

// ========== STEP 2: MAP LOCATION SELECTION ==========
const submitBtn = document.getElementById('submitBtn');
const backBtn = document.getElementById('backBtn');

function initMap(lat, lng) {
    map = L.map('map').setView([lat, lng], 16);
    const tileLayer = L.tileLayer(tileUrl, { attribution });
    tileLayer.addTo(map);

    // Do NOT load report markers here (selection mode should be clean)

    // Add marker and circle at user's location
    updateMarkerAndCircle(lat, lng);
    submitBtn.style.display = 'block';

    map.on('click', function (e) {
        updateMarkerAndCircle(e.latlng.lat, e.latlng.lng);
        submitBtn.style.display = 'block';
    });
}

function updateMarkerAndCircle(lat, lng) {
    if (marker) {
        map.removeLayer(marker);
        map.removeLayer(circle);
    }

    marker = L.marker([lat, lng]).addTo(map);
    circle = L.circle([lat, lng], { radius: 50 }).addTo(map);

    userCoordinates = { lat, lng };
    map.setView([lat, lng]);
}

// Submit button - send to backend
submitBtn.addEventListener('click', () => {
    if (!userCoordinates.lat || !userCoordinates.lng) {
        alert('Please select a location on the map');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    fetch('/report-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            lat: userCoordinates.lat,
            lng: userCoordinates.lng,
            filename: uploadedFilename
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                showResults(data);
            } else {
                alert('Error: ' + data.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Report';
            }
        })
        .catch(error => {
            alert('Error submitting report: ' + error);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Report';
        });
});

// Back button
backBtn.addEventListener('click', () => {
    // Remove report markers so the selection map remains uncluttered
    if (map && reportsLayer) {
        reportsLayer.clearLayers();
        try { map.removeLayer(reportsLayer); } catch (e) { }
        reportsLayer = null;
        reportMarkers = {};
    }
    document.getElementById('mapSection').classList.remove('active');
    document.getElementById('mapSection').style.display = 'none';
    document.getElementById('uploadSection').classList.add('active');
});

// ========== RESULTS ==========
const restartBtn = document.getElementById('restartBtn');

function loadReports() {
    // Returns a promise that resolves after reports are loaded
    return fetch('/reports')
        .then(resp => resp.json())
        .then(data => {
            if (data.status !== 'success') return;
            // clear existing report markers
            if (reportsLayer) {
                reportsLayer.clearLayers();
                reportMarkers = {};
            }
            data.reports.forEach(rep => {
                // Use circleMarker for a simple red marker
                const m = L.circleMarker([rep.lat, rep.lng], { color: 'red', radius: 8, fillOpacity: 0.9 }).addTo(reportsLayer);
                const popupContent = `
                <div>
                    <strong>Report ID:</strong> ${rep.id}<br>
                    <strong>Detected:</strong> ${rep.issues.join(', ')}<br>
                    <strong>AI Description:</strong><br>${rep.ai_description}
                </div>
            `;
                m.bindPopup(popupContent);
                reportMarkers[rep.id] = m;
            });
        })
        .catch(err => console.error('Error loading reports:', err));
}

function showResults(data) {
    // Show both result and the map of all reports
    document.getElementById('mapSection').style.display = 'block';
    document.getElementById('resultSection').style.display = 'block';
    document.getElementById('uploadSection').styleList = 'none';
    document.getElementById('uploadSection').style.display = 'none';

    const resultContent = document.getElementById('resultContent');
    resultContent.innerHTML = `
        <p><strong>Report ID:</strong> ${data.report_id}</p>
        <p><strong>Location:</strong> ${data.location}</p>
        <p><strong>Detected Issues:</strong> ${data.detected.join(', ') || 'None'}</p>
        <p style="color: green; margin-top: 20px;"><strong>✓ Report saved to database</strong></p>
    `;

    // Ensure map exists and center to submitted report
    const [latStr, lngStr] = data.location.split(',').map(s => s.trim());
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    // If map was hidden, Leaflet may need to recalculate sizes
    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 200);

    if (!map) {
        initMap(lat, lng);
    } else {
        map.setView([lat, lng], 16);
    }

    // Create the reports layer only when showing results (so selection screen stays clean)
    if (!reportsLayer) {
        reportsLayer = L.layerGroup().addTo(map);
    }

    // Load reports and open the popup for the newly submitted report when available
    loadReports().then(() => {
        let marker = reportMarkers[data.report_id];
        if (marker) {
            marker.openPopup();
            map.setView([lat, lng], 16);
            setTimeout(() => { if (map) map.invalidateSize(); }, 200);
            return;
        }

        // If server hasn't returned the new report yet, add it locally using response data
        const popupContent = `
            <div>
                <strong>Report ID:</strong> ${data.report_id}<br>
                <strong>Detected:</strong> ${data.detected.join(', ')}<br>
                <strong>AI Description:</strong><br>${data.ai_description || ''}
            </div>
        `;
        marker = L.circleMarker([lat, lng], { color: 'red', radius: 8, fillOpacity: 0.9 }).addTo(reportsLayer);
        marker.bindPopup(popupContent);
        reportMarkers[data.report_id] = marker;
        marker.openPopup();
        map.setView([lat, lng], 16);
        setTimeout(() => { if (map) map.invalidateSize(); }, 200);
    }).catch(err => console.error('Error loading reports after submit:', err));
}

// Restart button
restartBtn.addEventListener('click', () => {
    // Reset everything
    uploadedFilename = null;
    userCoordinates = { lat: null, lng: null };
    uploadStatus.innerHTML = '';
    previewImage.style.display = 'none';
    previewImage.src = '';
    nextBtn.style.display = 'none';
    imageInput.value = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Report';
    submitBtn.style.display = 'none';

    if (marker) {
        map.removeLayer(marker);
        map.removeLayer(circle);
    }

    // Also remove report markers so the next selection screen is clean
    if (map && reportsLayer) {
        reportsLayer.clearLayers();
        try { map.removeLayer(reportsLayer); } catch (e) { }
        reportsLayer = null;
        reportMarkers = {};
    }

    document.getElementById('resultSection').style.display = 'none';
    document.getElementById('uploadSection').classList.add('active');
    document.getElementById('uploadSection').style.display = 'block';
});