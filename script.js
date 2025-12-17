// --- DOM Elementleri ---
const dom = {
    input: document.getElementById('city-input'),
    searchBtn: document.getElementById('search-btn'),
    locateBtn: document.getElementById('locate-btn'),
    content: document.getElementById('weather-content'),
    mapContainer: document.getElementById('map-container'),
    loader: document.getElementById('loader'),
    bg: document.getElementById('bg-layer'),
    speakBtn: document.getElementById('speak-btn'),
    error: document.getElementById('error-toast'),
    hourly: document.getElementById('hourly-scroll'),
    adviceText: document.getElementById('advice-text'),
    voiceWave: document.getElementById('voice-wave')
};

// --- Global Değişkenler ---
let map;
let marker;
let lastSpeechText = "";

// --- Hava Kodları ---
const weatherTypes = {
    0: { icon: 'fa-sun', bg: 'sunny-bg', label: 'Açık' },
    1: { icon: 'fa-cloud-sun', bg: 'sunny-bg', label: 'Az Bulutlu' },
    2: { icon: 'fa-cloud', bg: 'cloudy-bg', label: 'Parçalı Bulutlu' },
    3: { icon: 'fa-cloud', bg: 'cloudy-bg', label: 'Kapalı' },
    45: { icon: 'fa-smog', bg: 'cloudy-bg', label: 'Sisli' },
    51: { icon: 'fa-cloud-rain', bg: 'rainy-bg', label: 'Çiseleme' },
    61: { icon: 'fa-cloud-showers-heavy', bg: 'rainy-bg', label: 'Yağmurlu' },
    71: { icon: 'fa-snowflake', bg: 'rainy-bg', label: 'Kar Yağışlı' },
    95: { icon: 'fa-bolt', bg: 'rainy-bg', label: 'Fırtına' }
};

window.addEventListener('DOMContentLoaded', initApp);

dom.searchBtn.addEventListener('click', handleSearch);
dom.input.addEventListener('keypress', (e) => e.key === 'Enter' && handleSearch());
dom.speakBtn.addEventListener('click', speakData);
dom.locateBtn.addEventListener('click', getUserLocation);

function initApp() {
    initMap();
    getUserLocation();
}

// --- HARİTA AYARLARI ---
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([39.0, 35.0], 5); // Zoom kontrolü gizlendi, daha temiz
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© Muhittin Akın Project',
        maxZoom: 19
    }).addTo(map);

    map.on('click', async function(e) {
        const { lat, lng } = e.latlng;
        updateMarker(lat, lng);
        fetchWeatherData(lat, lng, "Seçilen Konum");
    });
}

// --- KONUM SERVİSİ ---
function getUserLocation() {
    if (navigator.geolocation) {
        toggleLoader(true, "Konumun bulunuyor...");
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                updateMarker(latitude, longitude);
                fetchWeatherData(latitude, longitude, "Konumunuz");
            },
            () => {
                showError("Konum izni yok. Varsayılan açılıyor.");
                toggleLoader(false);
            }
        );
    } else {
        showError("Tarayıcınız konum servisini desteklemiyor.");
    }
}

// --- ARAMA MANTIĞI ---
async function handleSearch() {
    const city = dom.input.value.trim();
    if (!city) return;

    toggleLoader(true, "Şehir aranıyor...");

    try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=1&language=tr&format=json`);
        const geoData = await geoRes.json();
        
        if (!geoData.results) throw new Error("Bu şehri haritada bulamadım. Başka gezegen mi?");
        
        const { latitude, longitude, name } = geoData.results[0];

        updateMarker(latitude, longitude);
        fetchWeatherData(latitude, longitude, name);

    } catch (err) {
        showError(err.message);
        toggleLoader(false);
    }
}

// --- HAVA DURUMU ÇEKME ---
async function fetchWeatherData(lat, lon, cityName) {
    toggleLoader(true, "Veriler analiz ediliyor...");

    try {
        const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,weathercode,relativehumidity_2m,uv_index&timezone=auto`;
        
        const res = await fetch(apiUrl);
        const data = await res.json();

        renderApp(cityName, data);
        toggleLoader(false);

    } catch (err) {
        showError("Hava durumu alınamadı.");
        toggleLoader(false);
    }
}

// --- HARİTA GÜNCELLEME ---
function updateMarker(lat, lng) {
    if (marker) {
        marker.setLatLng([lat, lng]);
    } else {
        marker = L.marker([lat, lng]).addTo(map);
    }
    map.setView([lat, lng], 10);
}

// --- EKRANA BASMA (RENDER) ---
function renderApp(cityName, data) {
    dom.mapContainer.classList.remove('hidden');
    dom.content.classList.remove('hidden');

    const current = data.current_weather;
    const hourly = data.hourly;
    const currentHourIso = new Date().toISOString().slice(0, 13) + ":00";

    const currentIndex = hourly.time.findIndex(t => t.startsWith(currentHourIso.slice(0,13)));
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;

    const currentDetails = {
        humidity: hourly.relativehumidity_2m[safeIndex],
        uv: hourly.uv_index ? hourly.uv_index[safeIndex] : 0
    };

    const wInfo = weatherTypes[current.weathercode] || weatherTypes[0];
    
    // Verileri işle
    document.getElementById('city-name').innerText = cityName;
    document.getElementById('temp').innerText = Math.round(current.temperature) + "°";
    document.getElementById('weather-desc').innerText = wInfo.label;
    document.getElementById('wind').innerText = current.windspeed;
    document.getElementById('humidity').innerText = currentDetails.humidity;
    document.getElementById('uv-index').innerText = currentDetails.uv;
    
    document.getElementById('main-icon').className = `fas ${wInfo.icon}`;
    dom.bg.className = `bg-layer ${wInfo.bg}`;

    // Muhittin Asistan Konuşsun
    createAdvice(current.temperature, current.weathercode, cityName);

    // Saatlik Akış (Map ile)
    dom.hourly.innerHTML = hourly.time
        .map((time, i) => ({
            time,
            temp: hourly.temperature_2m[i],
            code: hourly.weathercode[i]
        }))
        .filter((_, i) => i >= safeIndex && i < safeIndex + 12) // 12 saatlik tahmin
        .map(item => {
            const hour = new Date(item.time).getHours().toString().padStart(2, '0') + ":00";
            const icon = (weatherTypes[item.code] || weatherTypes[0]).icon;
            return `
                <div class="hourly-card">
                    <span>${hour}</span>
                    <i class="fas ${icon}"></i>
                    <strong>${Math.round(item.temp)}°</strong>
                </div>
            `;
        })
        .join('');
    
    // Harita resize bug fix
    setTimeout(() => { map.invalidateSize(); }, 300);
}

// ==========================================================
// YENİ: MUHİTTİN ASİSTAN - GENİŞLETİLMİŞ MİZAH KÜTÜPHANESİ
// ==========================================================
function createAdvice(temp, code, city) {
    
    const messages = {
        // ----------------------------------------------------------------
        // 1. AŞIRI SICAK (> 35°C)
        // ----------------------------------------------------------------
        scorching: [
            "Güneşe ateş etsen yeridir! Dışarı çıkma, asfaltla bütünleşirsin.",
            "Klima kumandasıyla aşk yaşama vakti. Dışarısı cehennem provası gibi.",
            "Yumurta kırsan pişer, o derece. Bol su iç, buharlaşma.",
            "Muhittin amca diyor ki: Mecbur değilsen ekmek almaya bile gitme.",
            "Adana'ya dönmüş buralar. Gölgeler bile terliyor.",
            "Şapkasız çıkarsan beynin haşlanır, benden söylemesi.",
            "Klimayı kapatırsan arkadaşlığımız biter. O derece sıcak."
        ],

        // ----------------------------------------------------------------
        // 2. SICAK (25°C - 35°C)
        // ----------------------------------------------------------------
        hot: [
            "Deodorant kullanmak insanlık görevidir, lütfen ihmal etmeyelim.",
            "Esmiyor... Yaprak kımıldamıyor. Soğuk bir şeyler iç kendine gel.",
            "Tam deniz havası ama sen buradasın. Neyse, su iç bari.",
            "Güneş tepede, dikkat et. Sonra 'başıma güneş geçti' diye ağlama.",
            "Karpuz peynir havası gelmiş. Akşama menü belli.",
            "Gölge nerede, sen orada ol. Kertenkele gibi gezme ortalıkta.",
            "Dondurma yemek için harika bir bahane, hadi iyisin."
        ],

        // ----------------------------------------------------------------
        // 3. İDEAL / GÜZEL (18°C - 25°C)
        // ----------------------------------------------------------------
        pleasant: [
            "Hava mis! Evde oturanın kombisi bozulsun. Çık gez!",
            "Tam mangal havası! Kanatları kim alıyor?",
            "Ne terletir ne üşütür. İnsanın yaşama sevincini yerine getiren hava.",
            "Bugün moralini kimse bozamaz, hava arkanda.",
            "Camı pencereyi aç, ev havalansın. Oksijen bedava.",
            "Yürüyüşe çık, kulaklığını tak. Klip çekiyormuş gibi yürü.",
            "Aşık olma havası diyorlar ama sen yine de dikkat et, çarpılma."
        ],

        // ----------------------------------------------------------------
        // 4. HASTALIK HAVASI / SERİN (10°C - 18°C)
        // ----------------------------------------------------------------
        cool: [
            "İşte en tehlikeli hava! Gömlekle üşürsün, montla terlersin. Hırka al.",
            "Mevsim geçişi... Burnun akmaya, boğazın gıcıklanmaya hazır olsun.",
            "Annenin 'Oğlum/Kızım üstüne bir şey al' dediği hava bu işte.",
            "Nane-limon stoklarını kontrol et. Mikrop festivali başlıyor.",
            "Akşam serin olur, artistlik yapma yanına ceket al.",
            "Balkon keyfi yapılır ama dizine battaniye şart.",
            "Tam 'Ne giyeceğim ben şimdi?' havası."
        ],

        // ----------------------------------------------------------------
        // 5. SOĞUK (0°C - 10°C)
        // ----------------------------------------------------------------
        cold: [
            "Kombiyi yakma, pahalı. Kat kat giyin, lahana moduna geç.",
            "Dışarısı ısırıyor! Atkını, bereni almadan çıkma.",
            "Sıcak bir çay/kahve olmadan motor çalışmaz bu havada.",
            "Eller cepte yürüme sezonu açılmıştır. Burnuna sahip çık, düşmesin.",
            "Yorganın altından çıkmak büyük cesaret, tebrik ederim.",
            "Doğalgaz faturası düşündürüyor... Muhittin amca üzgün.",
            "Hava soğuk ama kalbimiz sıcak diyemeyeceğim, donuyoruz."
        ],

        // ----------------------------------------------------------------
        // 6. DONDURUCU / KARLI (< 0°C veya Kar Kodu)
        // ----------------------------------------------------------------
        freezing: [
            "Hissedilen: Sibirya. Penguenler yolda, geliyor.",
            "İçlik giymeyen bizden değildir. Termal ne varsa giy.",
            "Arabayı çıkarma, kış lastiğin yoksa dans edersin yolda.",
            "Kardan adam yapacaksan eldiven al, ellerin kopmasın.",
            "Ekmek ve süt stokla. Kutuplara döndü ortalık.",
            "Ayağını sıcak tut, başını serin... Yok başını da sıcak tut.",
            "Dışarı çıkmak zorunda mısın? Bence değilsin. Otur oturduğun yerde."
        ],

        // ----------------------------------------------------------------
        // 7. YAĞMURLU
        // ----------------------------------------------------------------
        rain: [
            "Ücretsiz araba yıkama servisi başladı! Şemsiyeni unutma.",
            "Romantiklik yapacağım diye yağmurda yürüme, romatizma olursun.",
            "Saçların bozulabilir, kapüşonunu tak. Sırılsıklam aşık olma, sadece ıslan.",
            "Trafik şimdi felç olur. Sabır taşına dönmeye hazır ol.",
            "Bereket yağıyor ama sen yine de su birikintilerine basma.",
            "Şemsiye evde kaldı değil mi? Geçmiş olsun.",
            "Cam kenarında kahve içip dışarıdakilere acıma havası."
        ],

        // ----------------------------------------------------------------
        // 8. FIRTINA
        // ----------------------------------------------------------------
        storm: [
            "Ortalık karışık! Uçan çatılara ve şemsiyelere dikkat et.",
            "Muhittin amca uyarısı: Ağaç altına park etme, üstüne kalır.",
            "Evde kal, elektronik aletleri fişten çek. Aksiyon aramaya gerek yok.",
            "Rüzgar değil, kasırga mübarek. Seni de uçurmasın, taş koy cebine.",
            "Pencereleri kapat, perdeyi çek. Dışarısı korku filmi gibi."
        ]
    };

    let category = '';

    // --- Kategori Belirleme Mantığı ---
    // Öncelik Sırası: Fırtına > Kar > Yağmur > Sıcaklık
    if (code >= 95) category = 'storm';
    else if (code >= 71) category = 'freezing'; // Kar
    else if (code >= 51) category = 'rain';
    else {
        // Yağış yoksa sıcaklığa bak
        if (temp >= 35) category = 'scorching';
        else if (temp >= 25) category = 'hot';
        else if (temp >= 18) category = 'pleasant';
        else if (temp >= 10) category = 'cool';
        else if (temp >= 0) category = 'cold';
        else category = 'freezing';
    }

    // İlgili kategoriden RASTGELE bir mesaj seç
    const selectedMessages = messages[category];
    const randomMsg = selectedMessages[Math.floor(Math.random() * selectedMessages.length)];
    
    // Final Metni Oluştur
    lastSpeechText = `${city} için hava ${Math.round(temp)} derece. ${randomMsg}`;
    
    // Ekrana Yaz
    dom.adviceText.innerText = randomMsg;
}

function speakData() {
    if (!lastSpeechText) return;
    const utterance = new SpeechSynthesisUtterance(lastSpeechText);
    utterance.lang = 'tr-TR';
    utterance.rate = 1.0; 
    utterance.onstart = () => dom.voiceWave.classList.remove('hidden');
    utterance.onend = () => dom.voiceWave.classList.add('hidden');
    window.speechSynthesis.speak(utterance);
}

function toggleLoader(show, text = "Yükleniyor...") {
    if (show) {
        dom.loader.querySelector('p').innerText = text;
        dom.loader.classList.remove('hidden');
        dom.content.classList.add('hidden');
    } else {
        dom.loader.classList.add('hidden');
    }
}

function showError(msg) {
    dom.error.innerText = msg;
    dom.error.classList.remove('hidden');
    setTimeout(() => dom.error.classList.add('hidden'), 4000);
}