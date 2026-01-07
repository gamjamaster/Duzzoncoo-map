// 전역 변수
let map;
let markers = [];
let infoWindows = [];
let myLocationMarker = null;
let userLocation = null;

// 페이지 로드 시 실행
window.onload = function() {
    console.log('✅ window.onload 실행');
    initMap();
    // 일반 검색으로 시작
    searchStores();
};

// 지도 초기화
function initMap() {
    if (typeof naver === 'undefined') {
        console.error('❌ Naver Maps API가 로드되지 않았습니다');
        return;
    }
    
    map = new naver.maps.Map('map', {
        center: new naver.maps. LatLng(37.5665, 126.9780),
        zoom: 12,
        minZoom: 7,
        maxZoom: 18,
        zoomControl: true,
        zoomControlOptions: {
            position: naver.maps.Position. TOP_RIGHT
        }
    });
    
    console.log('✅ 지도 초기화 완료');
}

// 네이버 좌표 → 위경도 변환
function convertCoordinates(mapx, mapy) {
    return {
        lng: mapx / 10000000,
        lat: mapy / 10000000
    };
}

// 기존 마커 제거
function clearMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
    infoWindows = [];
}

// 내 위치 마커 표시
function showMyLocation(lat, lng) {
    if (myLocationMarker) {
        myLocationMarker.setMap(null);
    }
    
    myLocationMarker = new naver.maps.Marker({
        position: new naver. maps.LatLng(lat, lng),
        map: map,
        icon: {
            content: `<div style="
                width: 20px;
                height: 20px;
                background:  #4285F4;
                border:  3px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 6px rgba(0,0,0,0.4);
                animation: pulse 2s infinite;
            "></div>
            <style>
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(66, 133, 244, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(66, 133, 244, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(66, 133, 244, 0); }
                }
            </style>`,
            anchor: new naver.maps.Point(11, 11)
        },
        title: '내 위치',
        zIndex: 1000
    });
    
    const myLocationInfo = new naver.maps.InfoWindow({
        content: `<div style="padding:  10px;"><strong>📍 내 위치</strong></div>`,
        borderWidth: 0,
        anchorSize: new naver.maps.Size(0, 0)
    });
    
    naver.maps.Event.addListener(myLocationMarker, 'click', function() {
        if (myLocationInfo.getMap()) {
            myLocationInfo.close();
        } else {
            myLocationInfo. open(map, myLocationMarker);
        }
    });
    
    map.setCenter(new naver.maps. LatLng(lat, lng));
    map.setZoom(14);
}

// 내 위치 기반 검색
async function searchNearby() {
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    const locationBtn = document.getElementById('locationBtn');
    const errorMessage = document.getElementById('errorMessage');
    const locationInfo = document.getElementById('locationInfo');
    
    loading.style. display = 'block';
    loadingText.textContent = '내 위치를 확인하는 중...';
    locationBtn.disabled = true;
    errorMessage.style.display = 'none';
    
    if (!navigator.geolocation) {
        errorMessage.textContent = '❌ 이 브라우저는 위치 정보를 지원하지 않습니다. ';
        errorMessage.style.display = 'block';
        loading.style.display = 'none';
        locationBtn.disabled = false;
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        async function(position) {
            userLocation = {
                lat: position.coords. latitude,
                lng: position. coords.longitude
            };
            
            console.log('✅ 내 위치:', userLocation);
            showMyLocation(userLocation.lat, userLocation.lng);
            
            locationInfo.textContent = `📍 현재 위치: 위도 ${userLocation.lat.toFixed(4)}, 경도 ${userLocation.lng.toFixed(4)}`;
            
            loadingText.textContent = '주변 매장을 검색하는 중 (1분 정도 소요될 수 있습니다)...';
            
            const searchInput = document.getElementById('searchInput');
            await performSearch(searchInput. value. trim());
        },
        function(error) {
            console.error('❌ 위치 오류:', error);
            
            let errorMsg = '';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = '❌ 위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = '❌ 위치 정보를 사용할 수 없습니다. ';
                    break;
                case error.TIMEOUT:
                    errorMsg = '❌ 위치 정보 요청 시간이 초과되었습니다.  일반 검색을 사용하세요.';
                    break;
                default:
                    errorMsg = '❌ 알 수 없는 오류가 발생했습니다.';
            }
            
            errorMessage.textContent = errorMsg;
            errorMessage. style.display = 'block';
            loading.style.display = 'none';
            locationBtn.disabled = false;
        },
        {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge:  60000
        }
    );
}

// 일반 검색
async function searchStores() {
    const searchInput = document.getElementById('searchInput');
    const keyword = searchInput.value.trim();
    
    if (!keyword) {
        alert('검색어를 입력해주세요! ');
        return;
    }
    
    userLocation = null;
    await performSearch(keyword);
}

// 실제 검색 수행
async function performSearch(keyword) {
    const searchBtn = document.getElementById('searchBtn');
    const locationBtn = document.getElementById('locationBtn');
    const loading = document. getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    const infoPanel = document.getElementById('infoPanel');
    const storeCount = document.getElementById('storeCount');
    const locationInfo = document.getElementById('locationInfo');
    const errorMessage = document.getElementById('errorMessage');
    
    loading.style.display = 'block';
    loadingText.textContent = userLocation ? 
        '주변 매장을 검색하는 중 (1분 정도 소요될 수 있습니다).. .' : 
        '매장 정보를 불러오는 중... ';
    searchBtn.disabled = true;
    locationBtn.disabled = true;
    infoPanel.style.display = 'none';
    errorMessage.style.display = 'none';
    clearMarkers();
    
    try {
        console.log(`🔍 검색 시작: ${keyword}`);
        
        // 위치 정보가 있으면 함께 전달
        let url = `/api/search-stores?keyword=${encodeURIComponent(keyword)}`;
        if (userLocation) {
            url += `&lat=${userLocation.lat}&lng=${userLocation.lng}`;
        }

        // 상세 검색 옵션 추가
        const detailedSearch = document.getElementById('detailedSearch')?.checked;
        if (detailedSearch) {
            url += `&detailed=true`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (! data.success) {
            throw new Error(data.error || '검색 실패');
        }
        
        console.log(`✅ ${data.count}개 매장 발견 (방법: ${data.method})`);
        
        let stores = data.stores;
        
        if (stores.length === 0) {
            errorMessage.textContent = '검색 결과가 없습니다.  다른 검색어를 시도해보세요.';
            errorMessage.style.display = 'block';
            loading.style.display = 'none';
            searchBtn.disabled = false;
            locationBtn.disabled = false;
            return;
        }
        
        // 거리 계산 및 정렬
        if (userLocation) {
            stores = stores.map(store => {
                const coords = convertCoordinates(store. mapx, store.mapy);
                const distance = calculateDistance(
                    userLocation.lat,
                    userLocation.lng,
                    coords.lat,
                    coords.lng
                );
                return { ...store, distance: distance };
            });
            
            stores.sort((a, b) => a.distance - b.distance);
            
            storeCount.textContent = `총 ${stores.length}개의 매장을 찾았습니다 🎉`;
            locationInfo.textContent = `📍 내 위치 기준 가까운 순으로 정렬 (주변 ${stores.length > 0 ? Math.max(...stores.map(s => s.distance)).toFixed(1) : 0}km 이내)`;
        } else {
            storeCount.textContent = `총 ${stores.length}개의 매장을 찾았습니다 🎉`;
            locationInfo.textContent = '💡 "내 위치에서 찾기" 버튼을 눌러 주변 매장을 찾아보세요!';
        }
        
        infoPanel.style.display = 'block';
        
        const bounds = new naver.maps.LatLngBounds();
        
        if (userLocation) {
            bounds.extend(new naver.maps. LatLng(userLocation.lat, userLocation.lng));
        }
        
        stores.forEach((store, index) => {
            const coords = convertCoordinates(store. mapx, store.mapy);
            const position = new naver.maps. LatLng(coords.lat, coords.lng);
            
            const marker = new naver.maps.Marker({
                position: position,
                map: map,
                title: store.name,
                icon: {
                    content: `<div style="
                        background: ${index < 3 ? '#FF6B6B' : '#667eea'};
                        color: white;
                        padding:  8px 12px;
                        border-radius: 20px;
                        font-weight: bold;
                        font-size: 14px;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                        white-space: nowrap;
                        ${index < 3 ? 'border: 2px solid #FFD700;' : ''}
                    ">${index + 1}${index < 3 && userLocation ? ' ⭐' : ''}</div>`,
                    anchor: new naver.maps.Point(20, 20)
                }
            });
            
            let distanceText = '';
            if (store.distance !== undefined) {
                if (store.distance < 1) {
                    distanceText = `<p><span class="label">📏 거리:</span> <strong style="color: #FF6B6B;">${(store.distance * 1000).toFixed(0)}m</strong></p>`;
                } else {
                    distanceText = `<p><span class="label">📏 거리:</span> <strong style="color: #FF6B6B;">${store.distance.toFixed(1)}km</strong></p>`;
                }
            }
            
            const contentString = `
                <div class="info-window">
                    <h3>🍪 ${store.name} ${index < 3 && userLocation ? '⭐' : ''}</h3>
                    ${distanceText}
                    <p><span class="label">📍 주소:</span><br>${store.roadAddress || store.address}</p>
                    ${store.phone !== '전화번호 없음' ? `<p><span class="label">📞 전화:</span> ${store. phone}</p>` : ''}
                    <p class="category">${store.category}</p>
                </div>
            `;
            
            const infoWindow = new naver.maps.InfoWindow({
                content: contentString,
                borderWidth: 0,
                backgroundColor: 'transparent',
                anchorSize: new naver.maps.Size(0, 0)
            });
            
            naver.maps.Event.addListener(marker, 'click', function() {
                infoWindows. forEach(iw => iw.close());
                
                if (infoWindow.getMap()) {
                    infoWindow.close();
                } else {
                    infoWindow.open(map, marker);
                }
            });
            
            markers.push(marker);
            infoWindows.push(infoWindow);
            bounds.extend(position);
        });
        
        map.fitBounds(bounds, {
            top: 50,
            right: 50,
            bottom: 50,
            left: 50
        });
        
        console.log('✅ 지도에 마커 표시 완료');
        
    } catch (error) {
        console.error('❌ 오류:', error);
        errorMessage.textContent = `오류:  ${error.message}`;
        errorMessage.style.display = 'block';
    } finally {
        loading.style.display = 'none';
        searchBtn.disabled = false;
        locationBtn.disabled = false;
    }
}

// 거리 계산
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

// Enter 키로 검색
document.getElementById('searchInput')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchStores();
    }
});