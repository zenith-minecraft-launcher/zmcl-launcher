# **Zenith · Minecraft 런처**

> Electron 기반으로 구축된 현대적이고 기능이 완비된 Minecraft 런처입니다.

---

## ✨ **프로젝트 소개**

**Zenith**는 게임 다운로드, 버전 관리, 모드 통합, 멀티플레이 대전, AI 어시스턴트를 하나로 통합한 **올인원 Minecraft 런처**입니다. 깔끔하고 우아한 사용자 인터페이스를 제공하며, 공식 / 오프라인 / Authlib 등 다양한 로그인 방식을 지원하고, Fabric, Forge, NeoForge, OptiFine 등 주류 모드 로더를 통합했습니다. 또한 EasyTier 기반 P2P 멀티플레이 기능과 DeepSeek 기반 AI 어시스턴트를 내장하고 있습니다(AI 기능은 후원이 필요합니다).

---

## 🚀 **핵심 기능**

### 🎮 **게임 실행 및 버전 관리**
- 모든 Minecraft 버전 지원: 정식판, 스냅샷판, 고대 버전, 만우절 버전
- 원클릭 다운로드, 리소스 파일(Client / Assets / Libraries) 자동 완성
- 여러 버전 공존, 버전 전환이 즉시 적용
- 스마트 Java 감지 및 자동 추천, 해당 Java 버전 자동 다운로드

### 🔐 **다양한 인증 방식**
- ✅ **Microsoft 공식 로그인**: 완전한 OAuth2 흐름, 정식 Xbox 계정 지원
- ✅ **오프라인 로그인**: 사용자 이름 커스터마이징, 인터넷 없이도 게임 실행
- ✅ **Authlib 타사 로그인**: 사용자 지정 인증 서버 지원, 오프라인 서버에 적합

### 🧩 **모드 및 리소스 팩 생태계**
- **Modrinth**와 **CurseForge** 두 플랫폼 통합 검색
- 모드 / 리소스 팩 / 셰이더 / 데이터 팩 / 월드 / 모드팩 지원
- 의존 관계 자동 해석, 원클릭 다운로드 및 설치
- 한국어 이름 강화(MC百科에서 한글화 정보 가져오기)

### 🔧 **모드 로더 원클릭 설치**
- **Fabric** — 경량, 높은 호환성
- **Forge** — 클래식하고 오랜 역사를 가진 로더
- **NeoForge** — Forge 포크, 신버전 우선
- **OptiFine** — 성능 최적화 및 셰이더 지원
- 버전 호환성 자동 감지, 충돌 알림

### 🌐 **타오와 멀티플레이(EasyTier)**
- **공인 IP 필요 없음**, P2P 홀펀칭 / 릴레이 자동 전환
- 룸 코드 방식: 초대 코드 생성, 친구가 원클릭으로 참여
- 다중 커뮤니티 노드, 낮은 지연 시간, 높은 안정성
- 코어 다운로드 및 관리 내장, 즉시 사용 가능

### 🤖 **AI 어시스턴트(DeepSeek)**
- AI 어시스턴트 내장, Minecraft 관련 질문 답변
- **스트리밍 출력** 지원, 실시간으로 글자 단위 회신
- 선택적 **딥 싱킹 모드** 및 **웹 검색**
- **사용자 지정 OpenAI 호환 모델** 지원, 사용 제한 없음
- 爱发电(ifdian.net) 후원으로 활성화, 개발자 모드 지원

### 🛠️ **툴박스**
- 게임 디렉토리 / 버전 디렉토리 / 로그 디렉토리 열기
- 세이브 백업 및 복원
- 캐시 정리, 오래된 로그 정리
- 네트워크 진단, Java 환경 감지

### 🎨 **기타 기능**
- 다크 / 라이트 테마 전환
- 사용자 지정 다운로드 소스(공식 / BMCLAPI / 자체 미러)
- 사용자 지정 JVM 인수, 메모리 할당
- 자동 업데이트(electron-updater 기반)
- 다운로드 진행률 시각화, 명확한 작업 관리
- 실행 로그 실시간 캡처 및 내보내기

---

## 🛠️ **기술 스택**

| 계층 | 기술 |
|------|------|
| **런타임** | Electron 28+ |
| **메인 프로세스** | Node.js + 네이티브 IPC |
| **프론트엔드** | 네이티브 HTML / CSS / JavaScript |
| **패키징** | electron-builder(NSIS / DMG / AppImage) |
| **자동 업데이트** | electron-updater |
| **외부 의존** | axios, adm-zip, fs-extra |
| **멀티플레이 코어** | EasyTier(외부 바이너리) |
| **AI 모델** | DeepSeek API(OpenAI 호환) |

---

## 📁 **프로젝트 구조**

```
Zenith/
├── src/
│   ├── main/                 # 메인 프로세스
│   │   ├── main.js          # 진입점 / IPC 라우팅 / 자동 업데이트
│   │   ├── auth/            # 인증 모듈
│   │   │   ├── microsoft.js   # Microsoft OAuth
│   │   │   ├── offline.js     # 오프라인 로그인
│   │   │   └── authlib.js     # Authlib 타사
│   │   ├── minecraft/       # 게임 코어
│   │   │   ├── launcher.js    # 실행 인수 구성 및 프로세스 관리
│   │   │   ├── java.js        # Java 감지 및 선택
│   │   │   ├── version.js     # 버전 메타데이터 해석
│   │   │   └── assets.js      # Assets 다운로드 및 검증
│   │   ├── download/        # 다운로드 모듈
│   │   │   ├── manager.js     # 버전 파일 다운로드
│   │   │   ├── sources.js     # 다중 소스 전환
│   │   │   ├── modrinth.js    # Modrinth API
│   │   │   ├── curseforge.js  # CurseForge API
│   │   │   ├── addonSearch.js # 통합 검색 + 한국어 강화
│   │   │   ├── addon.js       # 모드/리소스 팩 설치
│   │   │   └── loader.js      # 로더 자동 설치
│   │   ├── net/             # 네트워크 모듈
│   │   │   ├── taowa.js       # 타오와 멀티플레이 EasyTier 래퍼
│   │   │   └── toolbox.js     # 툴박스 도구 구현
│   │   ├── ai/              # AI 어시스턴트
│   │   │   ├── deepseek.js    # DeepSeek 스트리밍 채팅
│   │   │   └── activation.js  # 활성화 코드 검증
│   │   └── config/          # 설정 저장소
│   │       └── store.js       # 설정 및 계정 영속화
│   ├── preload/
│   │   └── index.js           # 프리로드 스크립트(contextBridge)
│   └── renderer/             # 렌더러 프로세스(프론트엔드 UI)
│       ├── index.html
│       ├── css/
│       └── js/
├── resources/                # 패키징 리소스
│   ├── icons/               # 앱 아이콘
│   ├── installer.nsh       # NSIS 설치 스크립트
│   └── license.txt         # 최종 사용자 라이선스 계약
├── package.json
└── build/                   # electron-builder 설정
```

---

## 📦 **빠른 시작**

### 환경 요구 사항
- **Node.js** ≥ 18
- **npm** / **pnpm** / **yarn** 중 하나
- Windows 10+ / macOS 11+ / Linux(AppImage 지원)

### 로컬 개발

```bash
# 1. 프로젝트 클론
git clone <your-repo-url>
cd Zenith

# 2. 의존성 설치
npm install

# 3. 개발 모드 실행
npm run dev
```

### 릴리스 패키지 빌드

```bash
# 현재 플랫폼 빌드
npm run build

# 또는 플랫폼별로 빌드
npm run build:win      # Windows(NSIS 설치 패키지)
npm run build:mac      # macOS(.dmg)
npm run build:linux    # Linux(.AppImage)
```

빌드 결과물은 `dist-release/` 디렉토리에 출력됩니다.

---

## 🔒 **보안 및 프라이버시**

- 사용자 로그인 자격 증명(Microsoft Token, Authlib Token)은 로컬에만 저장
- AI 대화는 기본적으로 DeepSeek API를 통하며, 데이터는 사용자 기기에만 저장
- 타오와 멀티플레이는 P2P 프로토콜을 사용하며, 데이터는 중앙 서버에 저장되지 않음
- 어떠한 사용자 데이터도 업로드하지 않음(자동 업데이트 확인 제외)

---

## 📝 **개발 가이드**

### 툴박스에 새 도구 추가하기

`src/main/net/toolbox.js`를 편집하여 `tools` 배열에 항목을 추가하세요:

```js
{
  key: 'my-tool',
  name: '나의 도구',
  description: '도구 설명',
  category: 'system',
  icon: '⚙️',
  async exec() {
    // 도구 로직
    return { ok: true, message: '실행 성공' };
  }
}
```

### 새로운 모드 로더 추가하기

`src/main/download/loader.js`의 `detectLoaders()` 메서드를 확장하고, `installLoaderVersion()`에 다운로드 및 압축 해제 로직을 추가하세요.

### 사용자 지정 API 미러

`src/main/download/sources.js`의 `sources` 배열을 수정하면 됩니다.

---

## 📄 **라이선스**

- **런처 코드**: GPL-3.0
- **Minecraft EULA**: Minecraft는 Mojang Studios의 등록 상표입니다. 이 런처에는 **Minecraft 게임 파일이 포함되지 않으며**, 모든 게임 파일은 Mojang / Microsoft 공식 채널을 통해 다운로드됩니다.
- **최종 사용자 계약**: `resources/license.txt`를 참조
- **이용 약관**: `使用协议.txt`를 참조
- **개인정보 처리방침**: `隐私政策.txt`를 참조

---

## 💖 **후원 및 지원**

이 프로젝트는 **爱发电(ifdian.net)**을 통해 후원을 받고 있습니다. 후원자는 AI 어시스턴트의 전체 사용 한도를 잠금 해제할 수 있습니다. 모든 서포터분들께 감사드립니다!

후원 링크: [링크로 이동](https://ifdian.net/a/JasonDeng)

---

## 🌟 **특징 하이라이트 요약**

| 기능 | 설명 |
|------|------|
| 🔄 **자동 업데이트** | 실행 시 새 버전을 자동으로 확인, 백그라운드 다운로드, 원클릭 업데이트 |
| 🎯 **스마트 Java 선택** | MC 버전에 따라 적절한 Java 환경을 자동으로 매칭 |
| 🌍 **다국어** | 완전한 중국어 인터페이스, 국내 사용자 습관에 맞춤 |
| ⚡ **초고속 다운로드** | 다중 소스 전환, BMCLAPI 국내 가속 지원 |
| 🤝 **P2P 멀티플레이** | 공인 IP 필요 없음, 룸 코드로 원클릭 대전 |
| 🤖 **AI 어시스턴트** | DeepSeek를 깊이 통합, MC 관련 모든 질문에 답변 |

---

> **Zenith** — Minecraft의 매일매일이 새로운 시작이 되기를.

---

## 📬 **연락처**

- 프로젝트 리포지토리: [링크로 이동](https://github.com/zenith-minecraft-launcher/zmcl-launcher/)
- 문제 제보: Issue 제출
