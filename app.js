const PERSONAL_BARCODES = {
  MARIA: "OYITOK-MARIA-001",
  SHERLY: "OYITOK-SHERLY-001",
  SAVINA: "OYITOK-SAVINA-001"
};

let selectedLocation = null;
let scannedBarcode = "";
let scannedPerson = "";
let cameraStream = null;
let barcodeDetector = null;
let scannerControls = null;
let locationMap = null;
let locationMarker = null;
let locationWatchId = null;

const $ = (selector) => document.querySelector(selector);

const formatDate = (date) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);

const formatTime = (date) =>
  new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);


// ========================================
// GOOGLE APPS SCRIPT API
// ========================================

const API_URL =
  "https://script.google.com/macros/s/AKfycbwAbZ5KJYN1v-3PDhe38soukTaTTTxTnYDj2wzKKbj9Roh87PyfqqDqzSUmhxtcdKFFig/exec";


// ========================================
// SIMPAN DATA ABSENSI
// ========================================

async function saveRecord(record) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      name: record.name,
      locationName: record.location_name,
      latitude: record.latitude,
      longitude: record.longitude,
      status: record.status,
      time: record.time,
      date: record.date,
      month: record.month,
      year: record.year
    })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.error || "Gagal menyimpan absensi."
    );
  }

  return result;
}


// ========================================
// NOTIFIKASI
// ========================================

function showNotice(message, type = "error") {
  const notice = $("#notice");

  if (!notice) return;

  notice.textContent = message;
  notice.className = `notice show ${type}`;
}


// ========================================
// MAP
// ========================================

function initializeMap() {
  if (!window.L || locationMap) return;

  locationMap = L.map("locationMap", {
    zoomControl: true
  }).setView([-6.2, 106.816666], 12);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,
      subdomains: "abcd",
      attribution: "© OpenStreetMap © CARTO"
    }
  ).addTo(locationMap);
}


function updateMap(latitude, longitude) {
  if (!locationMap) initializeMap();

  if (!locationMap) return;

  const coordinates = [latitude, longitude];

  if (!locationMarker) {
    locationMarker = L.marker(coordinates)
      .addTo(locationMap)
      .bindPopup("Lokasi absensi kamu");
  } else {
    locationMarker.setLatLng(coordinates);
  }

  locationMap.setView(coordinates, 17);
}


// ========================================
// GPS
// ========================================

function applyLocation(position) {
  const { latitude, longitude } = position.coords;

  selectedLocation = {
    latitude,
    longitude,
    name: "Lokasi GPS perangkat"
  };

  if ($("#locationStatus")) {
    $("#locationStatus").textContent =
      "Lokasi terdeteksi otomatis";
  }

  if ($("#locationDetail")) {
    $("#locationDetail").textContent =
      `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  const mapsLink = $("#mapsLink");

  if (mapsLink) {
    mapsLink.href =
      `https://www.google.com/maps?q=${latitude},${longitude}`;

    mapsLink.hidden = false;
  }

  updateMap(latitude, longitude);
}


function takeLocation(showError = true) {
  const status = $("#locationStatus");
  const detail = $("#locationDetail");

  if (!navigator.geolocation) {
    if (status) status.textContent = "GPS tidak tersedia";
    if (detail) {
      detail.textContent =
        "Perangkat ini tidak menyediakan lokasi.";
    }

    return;
  }

  if (status) {
    status.textContent = "Mencari lokasi...";
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      applyLocation(position);
    },
    () => {
      if (status) {
        status.textContent =
          "Lokasi belum diizinkan";
      }

      if (detail) {
        detail.textContent =
          "Aktifkan izin lokasi pada browser.";
      }

      if (showError) {
        showNotice(
          "Lokasi wajib diizinkan agar absensi dapat disimpan."
        );
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000
    }
  );
}


function watchLocation() {
  if (
    !navigator.geolocation ||
    locationWatchId !== null
  ) {
    return;
  }

  locationWatchId =
    navigator.geolocation.watchPosition(
      applyLocation,
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000
      }
    );
}


// ========================================
// JAM
// ========================================

function updateClock() {
  const now = new Date();

  if ($("#currentTime")) {
    $("#currentTime").textContent =
      formatTime(now);
  }

  if ($("#currentDate")) {
    $("#currentDate").textContent =
      formatDate(now);
  }
}


// ========================================
// CAMERA
// ========================================

function stopCamera() {
  if (scannerControls) {
    scannerControls.stop();
  }

  if (cameraStream) {
    cameraStream
      .getTracks()
      .forEach((track) => track.stop());
  }

  scannerControls = null;
  cameraStream = null;

  if ($("#cameraPreview")) {
    $("#cameraPreview").srcObject = null;
  }

  if ($("#cameraModal")) {
    $("#cameraModal").classList.remove("open");
    $("#cameraModal").setAttribute(
      "aria-hidden",
      "true"
    );
  }
}


// ========================================
// VALIDASI BARCODE
// ========================================

function acceptScan(value) {
  if (
    !Object.values(PERSONAL_BARCODES).includes(value)
  ) {
    return false;
  }

  scannedBarcode = value;

  scannedPerson = Object.keys(
    PERSONAL_BARCODES
  ).find(
    (person) =>
      PERSONAL_BARCODES[person] === value
  );

  stopCamera();

  if ($("#scanStatus")) {
    $("#scanStatus").textContent =
      `Barcode ${scannedPerson} terverifikasi. Tekan OK / Simpan absen untuk mencatat kehadiran.`;
  }

  showNotice(
    `Barcode ${scannedPerson} berhasil dipindai.`,
    "success"
  );

  return true;
}


// ========================================
// SCAN CAMERA
// ========================================

async function scanWithCamera() {
  if (
    !navigator.mediaDevices?.getUserMedia
  ) {
    showNotice(
      "Kamera tidak tersedia. Buka aplikasi melalui HTTPS atau localhost."
    );

    return;
  }

  try {
    $("#cameraModal").classList.add("open");
    $("#cameraModal").setAttribute(
      "aria-hidden",
      "false"
    );

    // ================================
    // ZXING
    // ================================

    if (!("BarcodeDetector" in window)) {
      if (!window.ZXing) {
        $("#cameraMessage").textContent =
          "Pembaca QR belum tersedia. Periksa koneksi internet lalu coba lagi.";

        return;
      }

      $("#cameraMessage").textContent =
        "Kamera aktif. Arahkan ke QR code personal.";

      const reader =
        new ZXing.BrowserMultiFormatReader();

      scannerControls =
        await reader.decodeFromConstraints(
          {
            video: {
              facingMode: {
                ideal: "environment"
              }
            }
          },
          $("#cameraPreview"),
          (result) => {
            if (result) {
              acceptScan(result.getText());
            }
          }
        );

      return;
    }

    // ================================
    // NATIVE BARCODE DETECTOR
    // ================================

    cameraStream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment"
          }
        },
        audio: false
      });

    $("#cameraPreview").srcObject =
      cameraStream;

    barcodeDetector =
      new BarcodeDetector({
        formats: [
          "code_128",
          "code_39",
          "ean_13",
          "qr_code"
        ]
      });

    const scanFrame = async () => {
      if (!cameraStream) return;

      try {
        const results =
          await barcodeDetector.detect(
            $("#cameraPreview")
          );

        const result = results.find(
          (item) =>
            Object.values(
              PERSONAL_BARCODES
            ).includes(item.rawValue)
        );

        if (
          result &&
          acceptScan(result.rawValue)
        ) {
          return;
        }
      } catch {
        // Kamera masih mencari barcode
      }

      requestAnimationFrame(scanFrame);
    };

    requestAnimationFrame(scanFrame);

  } catch (error) {
    console.error(error);

    showNotice(
      "Akses kamera ditolak. Izinkan kamera di browser untuk scan barcode."
    );
  }
}


// ========================================
// TOMBOL SCAN
// ========================================

const scanButton = $("#scanButton");

if (scanButton) {
  scanButton.addEventListener(
    "click",
    scanWithCamera
  );
}


const closeCamera = $("#closeCamera");

if (closeCamera) {
  closeCamera.addEventListener(
    "click",
    stopCamera
  );
}


// ========================================
// FORM ABSENSI
// ========================================

const attendanceForm =
  $("#attendanceForm");

if (attendanceForm) {
  attendanceForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const now = new Date();

      // Cek barcode
      if (
        !Object.values(
          PERSONAL_BARCODES
        ).includes(scannedBarcode)
      ) {
        showNotice(
          "Scan salah satu barcode Maria, Sherly, atau Savina terlebih dahulu."
        );

        return;
      }

      // Cek GPS
      if (!selectedLocation) {
        showNotice(
          "Tambahkan lokasi GPS terlebih dahulu."
        );

        return;
      }

      // Cek status
      const isPresent =
        now.getHours() < 7 ||
        (
          now.getHours() === 7 &&
          now.getMinutes() <= 45
        );

      const record = {
        name: scannedPerson,
        location_name:
          selectedLocation.name,
        latitude:
          selectedLocation.latitude,
        longitude:
          selectedLocation.longitude,
        status:
          isPresent
            ? "Hadir"
            : "Terlambat",
        time:
          formatTime(now),
        date:
          now.toISOString(),
        month:
          now.getMonth() + 1,
        year:
          now.getFullYear()
      };

      if (!record.name) {
        showNotice(
          "Scan QR code personal terlebih dahulu."
        );

        return;
      }

      try {
        await saveRecord(record);

        showNotice(
          `Absensi ${record.status.toLowerCase()} berhasil disimpan.`,
          "success"
        );

        attendanceForm.reset();

        selectedLocation = null;
        scannedBarcode = "";
        scannedPerson = "";

        if ($("#scanStatus")) {
          $("#scanStatus").textContent =
            "Belum ada barcode yang dipindai.";
        }

        if ($("#locationStatus")) {
          $("#locationStatus").textContent =
            "Mendeteksi lokasi otomatis...";
        }

        if ($("#locationDetail")) {
          $("#locationDetail").textContent =
            "Izinkan akses GPS saat browser memintanya. Lokasi akan diperbarui otomatis.";
        }

        takeLocation(false);

      } catch (error) {
        console.error(error);

        showNotice(
          `Absensi gagal disimpan: ${error.message}`
        );
      }
    }
  );
}


// ========================================
// START
// ========================================

initializeMap();
watchLocation();
takeLocation(false);

updateClock();

setInterval(
  updateClock,
  1000
);