# Share Toilet — 개발 문서

> 내 주변의 서울시 공중화장실을 찾아주는 지도 앱.
> 웹(Vue 3 + Vite) 코드베이스를 **Capacitor로 Android/iOS 네이티브 앱**으로 실행할 수 있도록 구성했습니다.

- 최종 갱신: 2026-07-18
- 앱 ID: `com.sharetoilet.app` · 앱 이름: `모두의 화장실`

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [아키텍처 / 폴더 구조](#3-아키텍처--폴더-구조)
4. [환경변수 설정](#4-환경변수-설정)
5. [웹으로 실행하기](#5-웹으로-실행하기)
6. [Android 네이티브 앱으로 실행하기](#6-android-네이티브-앱으로-실행하기)
7. [iOS 네이티브 앱 (선택)](#7-ios-네이티브-앱-선택)
8. [⚠️ 네이버 지도 인증 (필수 설정)](#8-️-네이버-지도-인증-필수-설정)
9. [실시간 서울시 API 연동](#9-실시간-서울시-api-연동)
10. [주요 기능 동작 방식](#10-주요-기능-동작-방식)
11. [개발 이력 (변경 내역)](#11-개발-이력-변경-내역)
12. [트러블슈팅](#12-트러블슈팅)

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 목적 | 현재 위치 기준 반경 내 공중화장실을 지도/목록으로 제공 |
| 데이터 | **전국 공중화장실 약 52,000개** (`public/data.json`, 표준데이터+지오코딩). 서울은 실시간 API + 상세정보 매핑 |
| 핵심 기능 | 내 주변 검색(반경 선택·거리순 정렬·거리 표시), 구/동 이름 검색, 지도 마커·정보창 |
| 실행 형태 | 웹(PWA 아님), **Android/iOS 네이티브 앱(Capacitor)** |

### 웹 화면 자동 반영

배포용 앱은 AAB에 포함된 웹 화면을 기본으로 실행하고, Render의 `live-update/manifest.json`을 확인해 새 웹 번들을 내려받습니다.

- `main` 브랜치가 Render에 배포되면 내용 해시가 달라진 웹 번들이 자동 생성됩니다.
- 앱은 새 번들을 백그라운드에서 내려받고 다음 실행 때 적용합니다.
- 네트워크 장애 때는 마지막 정상 번들을 그대로 사용하고, 실행 확인에 실패한 새 번들은 플러그인이 자동 롤백합니다.
- 화면, CSS, 문구, 검색/지도 로직, 공공데이터 변경은 일반적으로 새 AAB가 필요 없습니다.
- Capacitor/Android 플러그인, 네이티브 권한, 앱 아이콘·이름, `versionCode` 같은 네이티브 변경은 새 AAB가 필요합니다.
- 자동 업데이트 기능 자체를 기존 사용자에게 전달하기 위해서는 최초 1회 새 AAB 배포가 필요합니다.

---

## 2. 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| 프론트엔드 | Vue 3.5 (`<script setup>`), Vite 6 |
| 지도 | 네이버 지도 JavaScript API v3 + `vue3-naver-maps` |
| 네이티브 래퍼 | Capacitor 6 (Android / iOS) |
| 네이티브 위치 | `@capacitor/geolocation` (권한 처리 포함) |
| 빌드 요구사항 | Node 18+, JDK 17, Android SDK (Android 빌드 시) |

---

## 3. 아키텍처 / 폴더 구조

```
share-toilet/
├─ index.html                # 네이버 지도 스크립트 로드 (%VITE_NAVER_CLIENT_ID% 주입)
├─ .env / .env.example       # API 키 등 환경변수
├─ capacitor.config.json     # Capacitor 앱 설정 (appId, webDir=dist)
├─ vite.config.js            # 별칭(@), 개발용 /seoul-api 프록시
├─ src/
│  ├─ main.js                # Vue 앱 + 네이버 지도 플러그인 초기화
│  ├─ App.vue                # 메인 화면: 검색/내주변/목록 상태관리
│  ├─ components/
│  │  └─ NaverMapMarker.vue  # 지도 + 마커 + 정보창 + 현재위치 마커
│  ├─ utils/
│  │  └─ geolocation.js      # 크로스플랫폼 위치 조회 (네이티브/웹 자동 분기)
│  └─ assets/
│     ├─ data.json           # 화장실 5,046개 데이터
│     └─ data.js             # data.json export 래퍼
├─ assets/                   # 앱 아이콘/스플래시 소스 (@capacitor/assets 입력)
│  ├─ icon.png · icon-foreground.png · splash.png
├─ .gitlab-ci.yml            # 데이터 자동 갱신(예약) 파이프라인
├─ public/
│  ├─ data.json              # 전국 화장실 데이터(상세정보) — 런타임 fetch (JS 번들 제외)
│  └─ data-version.json      # 원격 갱신 감지용 버전(v)
├─ data/                     # 원본 CSV 넣는 곳(.gitignore) + 지오코딩 캐시
│  └─ README.md
├─ scripts/
│  ├─ geocode-toilets.mjs    # 주소 → 좌표 (네이버 지오코딩)
│  ├─ enrich-toilets.mjs     # CSV + 좌표 → public/data.json
│  └─ lib/csv.mjs
├─ android/                  # Capacitor 가 생성한 네이티브 Android 프로젝트
└─ docs/DEVELOPMENT.md       # (이 문서)
```

### 데이터 흐름

```
[앱 시작]
  └─ fetchToilets()  →  locations (전국 ~52,000)
        │   ├─ 서울: 실시간 API 위치 + data.json(서울) 상세정보 좌표매핑
        │   └─ 그 외 도시: public/data.json 직접 (실시간 실패 시 전체 폴백)
        └─ moveToCurrentLocation()  →  getCurrentPosition()  →  searchOrigin
              ├─ nearbyLocations  (반경 내 필터 + 거리 계산 + 거리순 정렬)   ← mode='near'
              └─ searchResults    (구/동/주소 텍스트 매칭)                    ← mode='search'
                    └─ displayedLocations  →  <NaverMapMarker> 마커 렌더
```

- **상태 관리 핵심**: `App.vue` 에서 `mode`(`near`/`search`)에 따라 `displayedLocations` computed 가 목록을 결정. 이전의 "computed 안에서 상태 변경" 안티패턴을 제거하고 순수 computed 로 재구성.

---

## 4. 환경변수 설정

`.env` 파일(커밋 제외, `.env.example` 참고):

```dotenv
VITE_NAVER_CLIENT_ID=발급받은_네이버_클라이언트_ID
VITE_SEOUL_API_KEY=서울_열린데이터_인증키
VITE_USE_LIVE_API=false      # true: 실시간 API(+로컬 폴백), false: 로컬 데이터만
VITE_DEFAULT_RADIUS=1000     # '내 주변' 기본 반경(m)
```

- Vite 는 `VITE_` 접두사 변수만 클라이언트에 노출합니다.
- `index.html` 의 `%VITE_NAVER_CLIENT_ID%` 는 **빌드 시점**에 치환됩니다 → `.env` 변경 후 반드시 재빌드.
- `.env` 는 `.gitignore` 에 포함(민감정보). 새 환경에서는 `.env.example` 을 복사해 값 채우기.

---

## 5. 웹으로 실행하기

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # 프로덕션 빌드 → dist/
npm run preview    # 빌드 결과 미리보기
```

---

## 6. Android 네이티브 앱으로 실행하기

### 사전 준비
- **JDK 17** (`java -version` 으로 확인)
- **Android SDK** (`ANDROID_HOME` 설정, platform 34/35 + build-tools)
- 실기기(USB 디버깅 ON) 또는 에뮬레이터

### 추가된 npm 스크립트

| 명령 | 설명 |
|------|------|
| `npm run cap:sync` | 웹 빌드 후 `cap sync` (dist → 네이티브로 복사) |
| `npm run android:open` | 빌드·동기화 후 Android Studio 열기 |
| `npm run android:run` | 빌드·동기화 후 연결된 기기/에뮬레이터에서 실행 |
| `npm run android:apk` | 디버그 APK 빌드 (`android/app/build/outputs/apk/debug/app-debug.apk`) |

### 방법 A — CLI 로 바로 실행 (권장)

```bash
npm run android:run
```

### 방법 B — 디버그 APK 만들어 설치

```bash
npm run android:apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p com.sharetoilet.app -c android.intent.category.LAUNCHER 1
```

### 방법 C — Android Studio 에서 열기

```bash
npm run android:open
# Android Studio 에서 ▶ Run
```

> **웹 코드를 수정했다면** 반드시 `npm run cap:sync`(또는 위 스크립트) 로 다시 동기화해야 네이티브 앱에 반영됩니다.

### 앱 아이콘/스플래시 재생성
`assets/` 의 소스 이미지를 바꾼 뒤:

```bash
npx capacitor-assets generate --android \
  --iconBackgroundColor '#FFFFFF' --iconBackgroundColorDark '#FFFFFF' \
  --splashBackgroundColor '#FFFFFF' --splashBackgroundColorDark '#FFFFFF'
```

> `toilet.png` 는 배경이 흰색(불투명)이라 어댑티브 배경색도 흰색으로 맞췄습니다. 배경색을 바꾸려면 전경 이미지의 흰 배경을 투명으로 만들어야 이질감이 없습니다.

### 위치 권한
`android/app/src/main/AndroidManifest.xml` 에 다음이 선언되어 있습니다:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

첫 "📍 내 주변" 실행 시 `@capacitor/geolocation` 이 런타임 권한을 요청합니다.

---

## 7. iOS 네이티브 앱 (선택)

macOS + Xcode 필요:

```bash
npm install @capacitor/ios@6
npx cap add ios
npm run cap:sync
npx cap open ios      # Xcode 에서 서명 후 실행
```

`ios/App/App/Info.plist` 에 위치 사용 설명 추가:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>내 주변 화장실을 찾기 위해 위치 정보를 사용합니다.</string>
```

---

## 8. ⚠️ 네이버 지도 인증 (필수 설정)

**증상:** 앱은 정상 실행되고 목록·거리·검색은 동작하지만, 지도 영역에
`네이버 지도 Open API 인증이 실패했습니다` 문구가 반복 표시됨.

### 8-1. 스크립트 엔드포인트 (신규 vs 구버전) — 가장 흔한 원인

네이버 클라우드 Maps 는 키 발급 시점에 따라 스크립트 형식이 다릅니다. **키에 맞는 형식을 써야** 인증됩니다.

| 구분 | 스크립트 (`index.html`) |
|------|-------------------------|
| **신규 NCP Maps** (2025~) | `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=KEY` |
| 구버전(클래식) | `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=KEY` |

> 현재 프로젝트는 **신규 방식(`oapi` + `ncpKeyId`)** 을 사용합니다. (Application `share-toilet` 키 기준 정상 확인)
> 만약 구버전 키를 쓴다면 `index.html` 의 host/파라미터를 위 표대로 바꾸세요.

### 8-2. 출처(Web 서비스 URL) 등록

네이버 지도 JS API 는 요청 **출처(origin)** 로도 인증합니다. Capacitor 안드로이드 앱의 WebView 출처는 `https://localhost` 입니다.

[네이버 클라우드 플랫폼 콘솔](https://console.ncloud.com) → **Maps** → 애플리케이션 → **Web 서비스 URL** 에 등록:

```
http://localhost
https://localhost
capacitor://localhost   # iOS
https://share-toilet.onrender.com   # 배포 웹
```

> 참고: `capacitor.config.json` 의 `server.androidScheme: "https"` 때문에 안드로이드 출처가 `https://localhost` 가 됩니다.
> `.env` 변경 후에는 반드시 `npm run cap:sync` (재빌드) 필요.

---

## 9. 실시간 서울시 API 연동

- **서울은 실시간 우선**(`VITE_USE_LIVE_API=true`, 기본값): 서울 실시간 API → 실패 시 **서울 폴백 JSON** → 그래도 안 되면 `data.json` 의 서울.
- **다른 도시**: 전국 `data.json`.
- 서비스명은 `VITE_SEOUL_TOILET_SERVICE`(현재 **`mgisToiletPoi`**). 4초 타임아웃 + 오류코드 감지로 빠르게 폴백.

**서울 폴백 파일** `data/seoun_public_toilet_location.json`
- `mgisToiletPoi` 응답을 저장한 JSON(`{DESCRIPTION, DATA:[...]}`). **실시간 API와 컬럼이 동일**해 같은 매퍼(`mapSeoulRecord`)로 처리.
- `App.vue` 에서 **동적 import**(`import('../data/…json')`) → 별도 청크로 분리되어 평소 로딩 부담 없이 폴백 때만 로드(네이티브 오프라인에서도 사용 가능).
- 컬럼: `COORD_X`(경도)·`COORD_Y`(위도, **WGS84 그대로**), `CONTS_NAME`(건물명), `ADDR_NEW/ADDR_OLD`(주소), `GU_NAME`(구), `TEL_NO`, `VALUE_02`(개방시간)·`VALUE_05`(장애인)·`VALUE_06`(기저귀 등).

> 📌 **서비스 변경 이력**: 구 `GeoInfoPublicToiletWGS`(OA-162) → **2025-09-24 종료**(ERROR-500). 신규 **OA-22586 / `mgisToiletPoi`** 로 교체.
> 실시간(XML)·폴백(JSON) 모두 `mapSeoulRecord` 로 매핑. `COORD_X/Y` 가 투영좌표(UTM-K)로 오면 `utmkToLatLng` 로 자동 변환하고, 한국 좌표 범위 밖이면 무효 처리.

- `VITE_USE_LIVE_API=false` 로 두면 실시간 시도 없이 **서울=폴백 JSON**, 다른 도시=`data.json`.
- 서울 API 는 `http` + CORS 미허용이라 브라우저에서 직접 호출 불가 →
  `vite.config.js` 의 개발 프록시로 우회합니다:

  ```js
  server: { proxy: { '/seoul-api': { target: 'http://openapi.seoul.go.kr:8088', changeOrigin: true, rewrite: p => p.replace(/^\/seoul-api/, '') } } }
  ```

- **제약:** 이 프록시는 **개발 서버(`npm run dev`)에서만** 동작합니다.
  - 정적 배포(Render) / 네이티브 앱에서 실시간 API 를 쓰려면 별도 프록시(서버리스 함수, 자체 Node 프록시 등)가 필요합니다.
  - 그래서 프로덕션·네이티브 기본값은 로컬 데이터입니다.

### 9-1. 데이터 아키텍처 & 빌드 (전국 데이터 + 상세정보)

**런타임 조회 전략** (`App.vue` `fetchToilets`):
- **서울**: 실시간 API(`GeoInfoPublicToiletWGS`)로 최신 위치를 받고 → `data.json`(서울)에서 좌표 근접 매칭으로 **상세정보(개방시간·변기수 등)를 보강**.
- **다른 도시**: `data.json` 직접 사용.
- **실시간 실패/미사용**: 전체 `data.json` 폴백 (서울 포함 전국, 상세정보 포함).

**`data.json` 생성 파이프라인** — 원본 CSV 에는 좌표가 없어 지오코딩이 필요합니다:

```bash
# 1) data/ 에 '전국공중화장실 CSV' 를 넣는다 (data/README.md 참고)
# 2) 주소 → 좌표 (네이버 지오코딩, 최초 1회 · 재개 가능 · 캐시)
node scripts/geocode-toilets.mjs
# 3) CSV + 좌표캐시 → src/assets/data.json (전국, 상세정보 포함)
npm run data:build
```

- `scripts/geocode-toilets.mjs`: `.env` 의 `VITE_NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 로 네이버 Geocoding 호출.
  결과는 `data/.geocode-cache.json` 에 캐시 → 중단해도 다시 실행하면 이어서 진행.
  (엔드포인트: `https://maps.apigw.ntruss.com/map-geocode/v2/geocode`, NCP 콘솔에서 **Geocoding** 서브서비스 활성화 필요)
- `scripts/enrich-toilets.mjs`: CSV 컬럼을 아래 스키마로 매핑해 `src/assets/data.json` 생성.
  - 좌표: 지오코딩 캐시 / 상세: `openHour`, `unisex`, `menToilet`, `womenToilet`, `disabled`, `diaper`, `tel`
  - 지역 구분: `sido`(시/도) — 런타임에서 서울/기타 도시 분기에 사용.

> 정보창은 이 상세 키가 채워지면 [정보창 표](#정보창-buildinfocontent)대로 자동 표시됩니다.
> ⚠️ 전국(약 5만 건)을 담으면 `data.json` 이 커집니다(수 MB~). 웹 초기 로딩이 부담되면 특정 시/도만 필터링해 빌드하는 방식을 고려하세요.

### 9-2. 데이터 최신 유지 (Phase 1: 원격 호스팅 + 자동 갱신)

앱에 데이터를 박제하면 갱신 때마다 재배포가 필요합니다. 이를 **원격 파일 + 버전 비교**로 분리했습니다.

**앱 로딩 순서** (`src/assets/data.js`):
1. 로컬 번들(`public/data.json`, 오프라인 대비)과 원격(`VITE_DATA_URL`)의 `data-version.json`(`v` 값) 비교
2. **원격이 더 최신이면** 원격 `data.json` 다운로드, 아니면 로컬 사용
3. 원격이 느리거나(예: Render 콜드스타트) 실패하면 **2.5초 타임아웃 → 로컬 폴백** → 시작 지연 없음

> `data-version.json` 은 `npm run data:build` 가 함께 생성(`v` = 생성 시각). 데이터가 바뀔 때만 대용량 파일을 내려받습니다.

**데이터 갱신 방법**

- **① 수동(지금 바로 가능)**: 로컬에서 파이프라인 실행 → 커밋 → 푸시 → Render 자동 재배포
  ```bash
  # data/ 에 최신 CSV 교체 후
  node scripts/geocode-toilets.mjs   # 증분(새 주소만)
  npm run data:build                 # public/data.json + data-version.json
  git add public/data.json public/data-version.json
  git commit -m "chore(data): 데이터 갱신" && git push
  ```
  → Render 가 재배포하면 앱들이 다음 실행 때 최신 데이터를 fetch (앱 업데이트 불필요).

- **② 자동(GitLab CI 예약)**: `.gitlab-ci.yml` 의 `update-data` 잡이 예약 주기마다 위 과정을 수행.
  - **CI/CD 변수 등록** (Settings → CI/CD → Variables):
    | 변수 | 용도 |
    |------|------|
    | `VITE_NAVER_CLIENT_ID` | 지오코딩 |
    | `NAVER_CLIENT_SECRET` | 지오코딩 (Masked) |
    | `PROJECT_ACCESS_TOKEN` | 데이터 커밋/푸시 (write_repository, Masked) |
    | `SOURCE_CSV_URL` | (선택) 최신 CSV 다운로드 URL — 있어야 "신규 데이터"가 반영됨 |
  - **예약 등록**: Settings → CI/CD → Schedules 에서 주기 지정(예: 매월 1일).
  - 지오코딩 캐시는 **GitLab CI 캐시**(`cache:`)로 파이프라인 간 유지 → git 커밋 없이 **새 주소만 증분 지오코딩**.

> ⚠️ `SOURCE_CSV_URL` 이 없으면 CI 는 기존 CSV 로만 재생성하므로 "더 최신" 데이터가 되진 않습니다. 진짜 자동 최신화는 최신 CSV 소스(공공데이터포털 표준데이터 export URL 또는 OpenAPI)를 연결해야 합니다.

**커밋 정책 (필요한 데이터만 git)**

| git 커밋 O (필요) | git 커밋 X (재생성/캐시/원본) |
|---|---|
| `public/data.json` (앱 데이터, 유일본) | `data/*.csv` (원본, 15MB) |
| `public/data-version.json` | `data/.geocode-cache.json` (캐시 → CI `cache:`) |
| 스크립트·설정·아이콘 소스 | `android/app/src/main/assets/public/**` (cap sync 복사본) |
| | `.claude/` (세션) |

- 커밋되는 대용량은 `public/data.json` **하나뿐**. 안드로이드용 복사본은 `cap sync` 가 매번 생성하므로 커밋 대상에서 제외.
- 향후 데이터 갱신마다 15MB 히스토리가 쌓이는 게 부담되면 **Git LFS**(`public/data.json`) 또는 **외부 호스팅**(GitLab Pages/R2)로 데이터를 git 밖으로 빼는 방식(Phase 2)을 고려하세요.

---

## 10. 주요 기능 동작 방식

### 내 주변 (mode = 'near')
1. "📍 내 주변" 클릭 → `getCurrentPosition()` (네이티브: Capacitor / 웹: 브라우저)
2. 실패 시 서울시청 좌표로 폴백
3. `nearbyLocations` computed 가 Haversine 거리 계산 → 반경 내 필터 → **가까운 순 정렬**
4. 목록·마커에 거리 배지(`228m`, `1.2km` 형식) 표시

### 반경 선택
- 300m / 500m / 1km / 2km / 3km. 변경 즉시 `nearbyLocations` 재계산(재측위 불필요).

### 이 근처 검색 (지도 이동 후 재검색)
- 지도를 드래그/줌 하면 `NaverMapMarker` 가 `region-changed` 이벤트로 지도 중심 좌표를 전달.
- 기준점(`searchOrigin`)에서 100m 이상 이동하면 지도 상단에 **"🔍 이 근처 검색"** 버튼 노출.
- 버튼을 누르면 `searchOrigin` 을 현재 지도 중심으로 바꿔 그 지점 기준 반경 내 화장실을 재검색(지도는 이동하지 않음). 거리 배지도 새 기준점 기준으로 재계산.

### 검색 (mode = 'search')
- 한글 2글자 이상 입력 시 title/address/도로명 부분 매칭.
- 위치를 알고 있으면 검색 결과도 가까운 순 정렬.

### 지도 마커 (`NaverMapMarker.vue`)
- **화장실 픽토그램 마커**: `toilet.png` 를 흰 원형 배지(파란 테두리)에 담아 표시 → 기본 핀보다 커서 터치가 쉬움.
- **클릭 토글**: 마커 탭 시 정보창 열림/닫힘 토글. 선택된 마커는 **주황 링 + 확대**로 강조(`updateSelectedStyles`).
- `center` prop 변경 시 부드럽게 이동(`panTo`).
- 파란 점(현재 위치) 마커 + 펄스 애니메이션, 우하단 "현재 위치" 버튼.

### 하단 목록 시트 (모바일)
- 지도를 크게 쓰기 위해 하단 시트는 **접힘 250px(검색 + 목록 1개) / 펼침 82vh**. 지도는 `flex:1` 로 나머지를 모두 차지.
- 상단 **핸들(그래버) 탭**으로 펼치기/접기. **지도 탭 시 자동 접힘**(`@map-tap`).
- (이전 버그) 모바일에서 `map 70vh + 시트 350px` 가 100vh 를 초과해 목록이 잘리던 문제 수정.

### 화장실 상태 투표 (사용가능/비번필요/잠김/사용못함)
- 정보창에서 상태 버튼 탭 = **투표(1인 1표)**. 각 버튼에 **카운트** 표시(라벨+숫자 2줄).
- **다른 상태 탭 시** 기존 표 -1, 새 표 +1 (표 이동). **같은 상태 재탭 시** 취소.
- **내 선택(최근)** 을 정보창에 "내 선택: X" 로 표기 + 버튼 하이라이트 + **마커 테두리 색** + 목록 **배지(라벨·카운트)**.
- 저장 구조(`toilet-status.json`): `{ [id]: { counts: {statusKey: n}, my: statusKey } }`. `@capacitor/filesystem`(네이티브=파일 / 웹=IndexedDB). 구버전 문자열 값은 자동 마이그레이션.
- ⚠️ 현재 카운트는 **기기 로컬**(사용자별)이라 사실상 0/1. 여러 사용자 집계(진짜 카운트)는 백엔드가 필요 — 데이터 구조는 그대로 서버 동기화에 재사용 가능.

### 키보드 동작
- **지도/마커 탭 시 소프트 키보드 자동 해제**(`dismissKeyboard` — 포커스된 입력창 `blur`). 마커를 눌러도 키보드가 남지 않음.

### 정보창 (`buildInfoContent`)
- 화장실명, 지번 주소, 도로명(있을 때).
- **거리 + 도보 예상시간** (보행 4.5km/h 기준, 예: `230m · 도보 약 3분`).
- **🧭 길찾기** (`window.__stRoute`) — 네이버 지도 **앱**으로 도보 길찾기(현재 위치 → 화장실) 실행.
  - 앱 설치됨 → `nmap://route/walk?...&appname=com.sharetoilet.app` 딥링크로 앱 열기(경로 세팅).
  - 앱 미설치 → "설치하시겠어요?" 확인 → **OK**: Play 스토어(`market://` → 실패 시 웹 스토어) / **취소**: 네이버 지도 **웹** 길찾기.
  - 설치 여부는 `@capacitor/app-launcher` 의 `canOpenUrl('nmap://')` 로 판별(AndroidManifest `<queries>` 에 `com.nhn.android.nmap`/`nmap` 스킴 선언 필요). 웹 환경에선 바로 웹 길찾기.
- **📋 주소복사** — 지번 주소를 클립보드에 복사(토스트 알림). `window.__stCopyAddress`.
- **풍부한 필드 자동 표시** — 데이터에 아래 필드가 있으면 정보창에 자동 노출(없으면 생략):
  | 필드(키) | 표시 |
  |----------|------|
  | `openHour` | 🕒 개방시간 |
  | `unisex` (bool) | 🚻 남녀공용 / 남녀구분 |
  | `menToilet` / `womenToilet` | 🚽 대변기 남/여 수 |
  | `disabled` (bool) | ♿ 장애인 화장실 |
  | `diaper` (bool) | 🍼 기저귀 교환대 |
  | `tel` | ☎ 관리기관 전화 |
  - 현재 `data.json` 에는 이 필드들이 없어 표시되지 않음 → [9-1 풍부한 데이터 연결](#9-1-풍부한-데이터-연결) 참고.

---

## 11. 개발 이력 (변경 내역)

### v2 — 개선 작업 (2026-07-18)

**1) API 키 → 환경변수 분리**
- `.env`, `.env.example` 신규. 네이버 clientId·서울 API 키를 `import.meta.env` 로 이동.
- `index.html` 은 `%VITE_NAVER_CLIENT_ID%` 주입. `.gitignore` 에 `.env` 추가.

**2) 실시간 서울시 API 연동 복구**
- 주석 처리됐던 API 로직을 `fetchFromSeoulApi()` 로 복원(페이지네이션 + XML 파싱).
- `vite.config.js` 에 `/seoul-api` 프록시 추가. 실패 시 로컬 데이터 자동 폴백.

**3) "내 주변" UX 개선**
- 하단 패널에 "📍 내 주변" 버튼 추가(기존엔 지도 버튼만 있어 목록이 안 채워지던 문제 해결).
- 반경 선택 드롭다운(기존 500m 하드코딩 → 300m~3km 선택).
- 거리순 정렬 + 목록/정보창 거리 표시.
- computed 안에서 상태를 변경하던 안티패턴 제거 → 순수 computed 로 재구성.

**4) 코드 정리**
- 디버깅 `console.log` 전부 제거(실제 에러용 `console.error/warn` 만 유지).
- 죽은 코드(`addCurrentLocationButton`), 거대 주석 블록 삭제.

### v3 — 네이티브 앱화 (2026-07-18)

- Capacitor 6 도입: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/geolocation`.
- `capacitor.config.json` 생성(appId `com.sharetoilet.app`, webDir `dist`).
- `src/utils/geolocation.js` 신규: 네이티브/웹 자동 분기 위치 조회 + 네이티브 권한 요청.
- `App.vue`·`NaverMapMarker.vue` 의 모든 위치 조회를 헬퍼로 교체(콜백 → async/await).
- `AndroidManifest.xml` 에 위치 권한 추가.
- `package.json` 에 `cap:sync` / `android:open` / `android:run` / `android:apk` 스크립트 추가.
- **검증 결과:** 실기기(Samsung, Android)에서 디버그 APK 설치·실행 성공. GPS 실측위 → 반경 1km 내 30개 거리순 표시 확인.

### v4 — 네이버 지도 인증 완료 (2026-07-18)

- 신규 Application 키(`share-toilet`, Client ID `iheghe6d2r`)로 교체.
- **신규 NCP Maps 방식 적용**: `index.html` 스크립트를 `openapi.map.naver.com?ncpClientId=` → **`oapi.map.naver.com?ncpKeyId=`** 로 변경.
- Client Secret 은 서버 전용이므로 `.env` 에 `NAVER_CLIENT_SECRET`(VITE_ 미접두)으로만 보관 → 클라이언트 번들 비노출.
- **검증 완료:** 실기기에서 **지도 타일 정상 렌더링 + 현재위치 파란점 + 주변 화장실 마커 + 거리 배지** 전부 동작 확인.

### v5 — 마커·아이콘·이근처검색 (2026-07-18)

- **화장실 픽토그램 마커**: 기본 핀 → `toilet.png` 원형 배지 마커로 교체(`makeToiletIcon`). 터치 영역 확대로 클릭 안정성 개선.
- **마커 클릭 개선**: `toggleInfoWindow` 로 열림/닫힘 토글, 선택 시 주황 링+확대 강조(`updateSelectedStyles`).
  - (버그 수정) `toilet.png` 배경이 흰색이라 선택 시 색반전(invert)이 흰 사각형으로 보이던 문제 → 반전 대신 테두리/확대 강조로 변경.
- **"이 근처 검색"**: `App.vue` 에 `searchOrigin` 도입 → 지도 이동 후 그 지점 기준 재검색. `NaverMapMarker` 가 `region-changed` 이벤트 emit, 100m 이상 이동 시 버튼 노출.
- **앱 런처 아이콘/스플래시**: `@capacitor/assets` 로 `toilet.png` 기반 전 해상도 아이콘 118개 생성(`assets/icon*.png`, `assets/splash*.png`). 앱 이름 "화장실 공유", 흰 배경 어댑티브 아이콘.
- **검증 완료:** 실기기에서 픽토그램 마커·정보창 토글·선택 강조·이 근처 검색·런처 아이콘("화장실 공유") 전부 동작 확인.

### v6 — 정보창 강화 (2026-07-19)

- **길찾기 버튼**: 정보창에서 네이버 지도 도보 길찾기(현재 위치 → 화장실) 링크.
- **도보 예상시간**: 거리 → 도보 분 환산 표시(`formatWalkTime`, 예: `230m · 도보 약 3분`).
- **주소복사 버튼**: 지번 주소를 클립보드 복사 + 토스트(`window.__stCopyAddress`, `showToast`).
- **풍부한 데이터 표시 준비**: `buildInfoContent` 가 `openHour/unisex/menToilet/womenToilet/disabled/diaper/tel` 필드를 있을 때만 자동 렌더. 실제 데이터 연결은 [9-1](#9-1-풍부한-데이터-연결) 참고(데이터 소스 확보 필요).
- **검증 완료:** 실기기에서 도보시간·길찾기 버튼·주소복사(토스트) 동작 확인.

> 데이터 분석 결과 현재 `data.json` 에는 위치·이름 외 상세정보가 없어(도로명조차 0.1%만 채워짐), 개방시간·변기수 등은 데이터 소스 보강이 필요함을 확인.

### v7 — 전국 데이터 + 상세정보 + 지오코딩 (2026-07-19)

- **데이터 소스 교체**: 전국공중화장실 CSV(53,738행) → `public/data.json` **약 52,000건**(서울 5,322 포함).
  - CSV 에 좌표가 없어 **네이버 지오코딩**으로 주소→좌표 변환(43,491건 성공). `scripts/geocode-toilets.mjs`(캐시·재개), `scripts/enrich-toilets.mjs`(매핑·`npm run data:build`).
  - 상세필드: 개방시간·변기수(남/여)·장애인화장실·기저귀교환대·전화번호 → 정보창 자동 표시.
- **데이터 아키텍처**: 서울=실시간 우선(+`data.json` 상세 좌표매핑), 다른 도시=`data.json`, 실패 시 전체 폴백. `sido` 로 지역 구분.
- **번들 최적화**: 15MB `data.json` 을 `public/` 로 옮겨 **런타임 fetch** → JS 번들 951KB→**100KB**.
- 주소 표시를 서울 하드코딩에서 **시/도 인식**으로 변경(정보창·목록). 표준 시/도만 인식하도록 정규화.
- **검증 완료:** 실기기에서 전국 데이터 로드 + 마커 + 정보창 상세정보(개방시간·변기수·장애인·전화) 표시 확인.

> ⚠️ 트레이드오프: 전국 데이터로 `public/data.json` 이 **약 15MB**. 네이티브는 로컬 자산이라 부담이 적지만, 웹 초기 로딩은 큽니다. 필요하면 시/도별 분할 로딩을 고려하세요.

### v8 — 데이터 최신 유지 Phase 1 (2026-07-19)

- **원격 호스팅 + 버전 비교 로딩**: `data.js` 가 `VITE_DATA_URL`(원격)과 로컬 번들의 `data-version.json` 을 비교해 **최신본 우선**, 원격 지연 시 **2.5초 타임아웃 → 로컬 폴백**. → 앱 재배포/업데이트 없이 데이터 갱신 가능.
- **버전 파일 생성**: `enrich-toilets.mjs` 가 `public/data-version.json`(`v`=생성시각) 동시 생성.
- **GitLab CI 자동 갱신**: `.gitlab-ci.yml` 예약 잡(`update-data`) — 증분 지오코딩 → `data:build` → 변경 시 커밋·푸시 → Render 재배포. 지오코딩 캐시 커밋으로 증분화.
- **검증 완료**: 실기기에서 원격(Render 콜드스타트) 지연 시 타임아웃 폴백으로 정상 시작, 데이터/마커 표시 확인.

> 상세 사용법: [9-2 데이터 최신 유지](#9-2-데이터-최신-유지-phase-1-원격-호스팅--자동-갱신)

### v9 — 모바일 UX 개선 (2026-07-19)

- **키보드 자동 해제**: 지도/마커 탭 시 포커스된 검색창을 `blur` → 소프트 키보드가 남지 않음(`NaverMapMarker` 의 `dismissKeyboard`, map `click`/마커 클릭에 연결).
- **하단 목록 시트 재설계**: 지도 `flex:1` 로 크게, 시트 접힘 250px(목록 1개)/펼침 82vh, 상단 핸들로 토글, 지도 탭 시 자동 접힘. 이전에 목록이 잘리던 레이아웃 오버플로 수정.
- **검증 완료**: 실기기에서 키보드 up→마커 탭→키보드 down, 시트 접힘/펼침/지도탭 접힘 동작 확인.

### v10 — 길찾기 네이티브 앱 연동 (2026-07-19)

- **네이버 지도 앱 딥링크**: 정보창 길찾기 → `@capacitor/app-launcher` 로 앱 설치 여부 판별 후
  설치 시 `nmap://route/walk` 딥링크로 경로 세팅, 미설치 시 **설치 유도(Play 스토어) / 거부 시 웹**.
- AndroidManifest `<queries>` 에 `com.nhn.android.nmap` + `nmap` 스킴 선언(Android 11+ 패키지 가시성).
- 하단 시트 접힘 높이 250px 로 축소(지도 최대화), 접힘 시 목록 1개.
- **검증**: 에뮬레이터(네이버 지도 미설치)에서 길찾기 → "설치하시겠어요?" 다이얼로그, 취소 → 웹 인텐트 실행 확인.

### v11 — 앱 이름 변경 (2026-07-19)

- 앱 이름 **`화장실 공유` → `모두의 화장실`** (`strings.xml` app_name/title, `capacitor.config.json` appName, `index.html` title).
- **검증**: APK 매니페스트 라벨 `모두의 화장실` 확인.

### v12 — 서울 실시간 API(mgisToiletPoi) + 서울 폴백 JSON (2026-07-28)

- 구 서울 화장실 API 종료(2025-09-24) 확인 → 신규 **`mgisToiletPoi`**(OA-22586)로 교체(`VITE_SEOUL_TOILET_SERVICE`).
- 실시간(XML)·폴백(JSON) 공용 매퍼 `mapSeoulRecord` 도입. `COORD_X/Y`(WGS84) 매핑 + UTM-K 변환 안전장치 + 한국 좌표범위 검증.
- **서울 폴백**: `data/seoun_public_toilet_location.json` 을 동적 import 로 연결. 아키텍처 = 서울(실시간→폴백JSON), 그 외(전국 data.json).
- (미검증) Bash 도구 일시 장애로 빌드·실호출 검증은 도구 복구 후 진행 예정.

### v13 — 화장실 상태 표시(파일 저장) + 길찾기 버그 수정 (2026-08-13)

- **상태 기능**: 정보창에서 사용가능/비번필요/잠김/사용못함 선택 → 마커 색·목록 배지 반영. `@capacitor/filesystem` 로 `toilet-status.json` 저장(기기 로컬).
- **길찾기 버그 수정**: Android `canOpenUrl` 은 URL 스킴이 아니라 **패키지명**으로 판별 → `com.nhn.android.nmap` 전달로 수정(설치돼 있으면 물어보지 않고 앱 실행). 앱 실행 실패 시 웹 폴백 추가.
- **서울 폴백 검증**: 에뮬레이터에서 `seoun_public_toilet_location.json` 로 서울 마커 85개(반경 1km) 정상 표시, 상태 저장·재시작 유지 확인.

### v14 — 상태 투표(카운트) 방식 (2026-08-13)

- 상태를 단순 표시 → **1인 1표 투표 + 카운트**로 변경. `{counts, my}` 구조로 저장.
- 전환 시 표 이동(기존 -1/새 +1), 재탭 취소. 버튼에 카운트(2줄), "내 선택" 표기, 마커/배지 반영.
- **검증**: 에뮬레이터에서 사용가능 투표(1) → 잠김 전환(사용가능 0/잠김 1, 마커 초록→빨강) + 파일 저장·재시작 유지 확인.

---

## 12. 트러블슈팅

| 증상 | 원인 / 해결 |
|------|-------------|
| 지도에 "인증이 실패했습니다" | [8번](#8-️-네이버-지도-인증-필수-설정) — NCP 콘솔에 `https://localhost` 등록 |
| 지도가 아예 안 뜸(웹) | `.env` 의 `VITE_NAVER_CLIENT_ID` 확인 후 **재빌드** |
| "내 주변" 눌러도 위치 안 잡힘 | 기기 위치(GPS) ON, 앱 위치 권한 허용 확인. 실패 시 서울시청으로 폴백 |
| 네이티브에 코드 변경 미반영 | `npm run cap:sync` 재실행 필요 |
| Gradle 빌드 실패 | JDK 17 인지 확인(`JAVA_HOME`), `ANDROID_HOME` 설정 확인 |
| 실시간 API 안 됨(배포/네이티브) | 정상. 프록시는 dev 전용 → 로컬 데이터 폴백. 별도 서버 프록시 필요 |
| APK 설치 안 됨 | `adb devices` 로 기기 인식 확인, USB 디버깅 ON |
