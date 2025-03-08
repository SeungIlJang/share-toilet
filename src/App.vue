<script setup>
import NaverMapMarker from "@/components/NaverMapMarker.vue";
import { ref, onMounted, computed } from 'vue';

const API_KEY = '62636d69436a6173383664786f6451';
const locations = ref([]); // 전체 화장실 데이터
const displayedLocations = ref([]); // 지도에 표시할 데이터
const selectedToiletId = ref(null);
const searchQuery = ref('');
const isLoading = ref(false);
const centerLocation = ref(null);
const searchRadius = 1000; // 1km 반경

// 검색된 화장실 목록
const filteredLocations = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query || !isValidKoreanSearch(query)) {
    displayedLocations.value = [];
    centerLocation.value = null;
    return [];
  }
  
  const filtered = locations.value.filter(location => 
    location.title.toLowerCase().includes(query) ||
    location.address.toLowerCase().includes(query) ||
    (location.newAddress && location.newAddress.toLowerCase().includes(query))
  );

  displayedLocations.value = filtered;
  
  // 검색 결과가 있으면 첫 번째 위치로 지도 이동
  if (filtered.length > 0) {
    // 디버깅용 로그
    console.log('First location:', filtered[0]);
    
    centerLocation.value = {
      latitude: filtered[0].latitude,
      longitude: filtered[0].longitude
    };
  } else {
    centerLocation.value = null;
  }

  return filtered;
});

// 전체 화장실 데이터 조회
const fetchToilets = async () => {
  try {
    isLoading.value = true;
    let page = 1;
    let hasMore = true;
    const pageSize = 1000;
    const allLocations = [];

    while (hasMore) {
      const startIndex = (page - 1) * pageSize + 1;
      const endIndex = page * pageSize;
      
      const response = await fetch(
        `http://openapi.seoul.go.kr:8088/${API_KEY}/xml/GeoInfoPublicToiletWGS/${startIndex}/${endIndex}/`
      );
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      
      const rows = xmlDoc.getElementsByTagName('row');
      
      const pageLocations = Array.from(rows).map((row, index) => {
        const lat = row.getElementsByTagName('LAT')[0]?.textContent;
        const lng = row.getElementsByTagName('LNG')[0]?.textContent;
        const guNm = row.getElementsByTagName('GU_NM')[0]?.textContent;
        const hnrNam = row.getElementsByTagName('HNR_NAM')[0]?.textContent;
        const newAddress = row.getElementsByTagName('NEADRES_NM')[0]?.textContent;

        return {
          id: row.getElementsByTagName('OBJECTID')[0]?.textContent || ((page - 1) * pageSize + index + 1),
          title: `${guNm} ${hnrNam} 공중화장실`,
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
          address: `${guNm} ${hnrNam}`,
          guName: guNm,
          dongName: hnrNam,
          newAddress: newAddress?.trim() || null
        };
      }).filter(location => location.latitude && location.longitude);

      allLocations.push(...pageLocations);
      page++;

      if (rows.length !== pageSize) {
        hasMore = false;
        break;
      }
    }

    locations.value = allLocations;
  } catch (error) {
    console.error('화장실 정보 가져오기 실패:', error);
  } finally {
    isLoading.value = false;
  }
};

// 한글 검색어 유효성 검사
const isValidKoreanSearch = (text) => {
  const koreanPattern = /[가-힣]/g;
  const koreanLength = (text.match(koreanPattern) || []).length;
  return koreanLength >= 2;
};

// 검색 상태 메시지
const searchStatus = computed(() => {
  if (isLoading.value) {
    return '데이터를 불러오는 중...';
  }
  if (!searchQuery.value) {
    return '구나 동 이름을 입력하세요';
  }
  if (!isValidKoreanSearch(searchQuery.value)) {
    return '한글 2글자 이상 입력하세요';
  }
  return `검색결과: ${filteredLocations.value.length}개`;
});

// 디바운스 함수
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
};

// 디바운스된 검색 핸들러
const handleSearch = debounce((e) => {
  searchQuery.value = e.target.value;
  selectedToiletId.value = null;  // 검색 시 선택 상태 초기화
}, 300);

// 화장실 목록 클릭 핸들러 추가
const handleLocationClick = (location) => {
  centerLocation.value = {
    latitude: location.latitude,
    longitude: location.longitude
  };
  selectedToiletId.value = location.id;
};

// 현재 위치로 이동하고 근처 화장실 표시
const moveToCurrentLocation = () => {
  navigator.geolocation.getCurrentPosition((position) => {
    const { latitude, longitude } = position.coords;
    centerLocation.value = { latitude, longitude };

    // 근처 화장실 필터링
    displayedLocations.value = locations.value.filter(location => {
      const distance = getDistanceFromLatLonInKm(latitude, longitude, location.latitude, location.longitude);
      return distance <= searchRadius / 1000; // 반경 내의 화장실
    });
  }, (error) => {
    console.error('현재 위치를 가져올 수 없습니다:', error);
  });
};

// 두 좌표 간의 거리 계산 함수 (Haversine formula)
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // 지구 반지름 (km)
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // 거리 (km)
};

const deg2rad = (deg) => {
  return deg * (Math.PI/180);
};

onMounted(() => {
  fetchToilets().then(() => {
    moveToCurrentLocation(); // 컴포넌트가 마운트될 때 현재 위치로 이동
  });
});
</script>

<template>
  <div class="container">
    <div class="map-container">
      <NaverMapMarker 
        :locations="displayedLocations" 
        :selected-id="selectedToiletId"
        :center="centerLocation"
      />
    </div>
    <div class="bottom-container">
      <div class="search-container">
        <input 
          type="text" 
          v-model="searchQuery"
          @input="handleSearch"
          placeholder="구나 동 이름으로 검색 (예: 강남구, 역삼동)"
          class="search-input"
          :disabled="isLoading"
        />
        <div class="search-info" 
             :class="{ 'warning': searchQuery && !isValidKoreanSearch(searchQuery) }">
          {{ searchStatus }}
        </div>
      </div>
      <div class="list-scroll">
        <ul v-if="!isLoading">
          <li 
            v-for="location in displayedLocations" 
            :key="location.id" 
            class="location-item"
            :class="{ 'selected': selectedToiletId === location.id }"
            @click="handleLocationClick(location)"
          >
            <h3>{{ location.title }}</h3>
            <p>{{ location.address }}</p>
            <p v-if="location.newAddress" class="new-address">도로명: {{ location.newAddress }}</p>
          </li>
        </ul>
        <div v-else class="loading-message">
          데이터를 불러오는 중입니다...
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  width: 100%;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
}

.map-container {
  flex: 1;
  position: relative;
  min-height: 300px; /* 모바일에서 최소 높이 보장 */
}

.bottom-container {
  background-color: #f5f5f5;
  padding: 15px;
  border-top: 1px solid #ddd;
  display: flex;
  gap: 15px;
  height: 250px;
}

.search-container {
  width: 250px;  /* 너비 줄임 */
  padding: 4px;  /* 패딩 줄임 */
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;  /* 간격 줄임 */
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.search-input:focus {
  border-color: #2196F3;
  outline: none;
}

.search-info {
  font-size: 14px;
  color: #666;
  padding: 2px;
  text-align: center;
}

.search-info.warning {
  color: #ff6b6b;
  font-weight: 500;
}

.list-scroll {
  flex: 1;
  overflow-y: auto;
  background-color: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.location-item {
  padding: 10px;
  margin-bottom: 8px;
  background-color: #f8f8f8;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.location-item:hover {
  background-color: #f0f0f0;
  transform: translateY(-2px);
}

.location-item.selected {
  background-color: #e3f2fd;
  border: 1px solid #2196F3;
}

.location-item h3 {
  margin: 0 0 4px 0;  /* 마진 줄임 */
  color: #333;
  font-size: 14px;  /* 폰트 크기 줄임 */
}

.location-item p {
  margin: 0;
  color: #666;
  font-size: 12px;  /* 폰트 크기 줄임 */
}

.new-address {
  margin-top: 4px !important;
  color: #2196F3 !important;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;  /* flex에서 grid로 변경 */
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));  /* 반응형 그리드 */
  gap: 10px;
}

/* 검색 결과가 없을 때 */
ul:empty::after {
  content: '검색 결과가 없습니다';
  display: block;
  text-align: center;
  padding: 20px;
  color: #666;
  font-size: 14px;
}

/* 반응형 스타일 수정 */
@media (max-width: 1440px) {
  .bottom-container {
    height: 300px;
  }
}

@media (max-width: 1024px) {
  .bottom-container {
    height: 320px;
  }

  ul {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}

@media (max-width: 768px) {
  .container {
    height: 100vh;
    overflow: hidden;
  }

  .bottom-container {
    flex-direction: column;
    height: 340px;
    overflow: hidden;
  }

  .search-container {
    width: 100%;
    flex-shrink: 0;
  }

  .list-scroll {
    width: 100%;
    overflow-y: auto;
  }

  ul {
    grid-template-columns: 1fr;  /* 모바일에서 1열로 */
  }

  .map-container {
    height: 70vh;
    flex: none;
  }
}

@media (max-width: 480px) {
  .bottom-container {
    padding: 8px;
    gap: 8px;
    height: 350px;
  }

  .search-container {
    padding: 4px;
  }

  .list-scroll {
    padding: 8px;
  }

  .location-item {
    padding: 8px;
    margin-bottom: 6px;
  }

  .search-input {
    padding: 6px;
    font-size: 12px;
  }

  .search-info {
    font-size: 12px;
  }

  .location-item h3 {
    font-size: 13px;
  }

  .location-item p {
    font-size: 11px;
  }
}

.loading-message {
  text-align: center;
  padding: 20px;
  color: #666;
  font-size: 14px;
}

.search-input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}
</style>
