import './assets/main.css'
import { createNaverMap } from "vue3-naver-maps";

import { createApp } from 'vue'
import App from './App.vue'
import { startLiveUpdate } from './services/liveUpdate.js'

createApp(App)
    .use(createNaverMap, {
        clientId: import.meta.env.VITE_NAVER_CLIENT_ID, // .env 의 VITE_NAVER_CLIENT_ID
        category: "ncp", // Optional
        subModules: [], // Optional
    })
    .mount("#app");

// 네이티브 앱에서는 현재 번들의 정상 실행을 알린 뒤 새 웹 번들을 백그라운드로 받는다.
// 새 번들의 다운로드가 끝나면 WebView를 다시 불러와 즉시 적용한다.
void startLiveUpdate();
