# Share Toilet 🚻

내 주변의 서울시 공중화장실을 찾아주는 지도 앱.
Vue 3 + Vite 웹앱을 **Capacitor 로 Android/iOS 네이티브 앱**으로 실행합니다.

설치 앱은 AAB에 포함된 화면을 기본으로 실행하고, Render에 새 웹 번들이 배포되면 안전하게 내려받아 다음 실행부터 자동 반영합니다. 네트워크가 없거나 업데이트에 문제가 생기면 마지막 정상 화면을 계속 사용합니다.

## 주요 기능
- 📍 **내 주변** — 현재 위치 기준 반경 내 화장실을 거리순으로 표시 (반경 300m~3km 선택, 거리 배지)
- 🔍 **이 근처 검색** — 지도를 옮긴 지점 기준으로 재검색
- 🔎 **검색** — 구/동 이름으로 검색
- 🚻 **화장실 픽토그램 마커** — 탭하면 정보창(주소·거리), 선택 마커 강조
- 🗺️ 네이버 지도 기반

## 빠른 시작

```bash
npm install

# 웹으로 실행
npm run dev

# Android 네이티브 앱으로 실행 (JDK 17 + Android SDK 필요)
npm run android:run

# 디버그 APK 빌드
npm run android:apk
```

> 이 자동 업데이트 기능을 기존 사용자에게 전달하려면 최초 1회 새 AAB가 필요합니다. 이후 화면·문구·검색·지도 로직 같은 웹 수정은 새 AAB 없이 반영되며, 네이티브 플러그인, Android 권한, 앱 아이콘, 앱 이름, 버전 코드는 계속 새 AAB가 필요합니다.

> `.env.example` 을 `.env` 로 복사하고 API 키를 채우세요.
> 지도 인증 등 상세 설정·빌드·트러블슈팅은 **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** 참고.

## ⚠️ 지도가 "인증 실패" 로 뜨면
1. **스크립트 형식** — 신규 NCP Maps 키는 `index.html` 에서 `oapi.map.naver.com ... ?ncpKeyId=` 형식 사용(현재 적용됨). 구버전 키는 `openapi.map.naver.com ... ?ncpClientId=`.
2. **출처 등록** — 네이버 클라우드 콘솔 → Maps → Web 서비스 URL 에 `https://localhost` 추가.

자세한 내용은 [docs/DEVELOPMENT.md #8](docs/DEVELOPMENT.md#8-️-네이버-지도-인증-필수-설정).

## 문서
- 📘 [개발 문서 (DEVELOPMENT.md)](docs/DEVELOPMENT.md) — 아키텍처, 환경변수, 빌드/실행, 개발 이력, 트러블슈팅
