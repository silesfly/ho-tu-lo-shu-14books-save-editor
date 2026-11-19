# 하락군협전 십사천서 세이브 에디터 v1.0

`Ho Tu Lo Shu: The Books of Dragon` (`14books` 창작마당 모드 `3138418939` + `2026-10-12` 기능 패치 + `mmxx` 한글 패치, Steam AppID `952860`) 전용 3중 표면 오프라인 세이브 편집기입니다.

## 주요 실행 방식 (3종 표면)

- **단독 오프라인 HTML**: `dist/HoTuLoShu14BooksSaveEditor-v1.0.html` (CSP 엄격 적용, 외부 요청 0건, 라이트/다크 테마, 키보드 탭 접근성)
- **Python 3 CLI 및 로컬 웹 서버**: `ssts_editor.py` (`demo`, `inspect`, `validate`, `presets`, `edit`, `serve`)
- **Windows x64 WebView2 단독 실행 파일**: `src/SaveStore.cs` + `src/SaveEditor.cs` (`.NET Framework 4.8` + `WebView2` `SetVirtualHostNameToFolderMapping`)

## 지원 세이브 형식

- `HELUO_1_0` / `HELUO_1_1` 9바이트 ASCII 머리글 + LZ4/MessagePack 2블록 프레임
- `2026-10-12` 십사천서 전용 푸터 `SSTS-WULINLOG-V2` (`[payload][Int32LE len]["SSTS-WULINLOG-V2"]`) 무결성 검증·편집·보존
- 미편집 NPC 슬라이스 및 대용량 `Flag` 맵(`lazy` 슬라이스 접근) 무손실 보존
- `ModId`/`ModName` 및 비숫자 문자열 ID(`NicknameID`, `CurrentNeiGongID`, `CurrentQingGongID`) 호환

## 십사천서 전용 편집 기능

- **9종 장비 슬롯**: `MajorWeapon`(주무기), `MinorWeapon`(부무기), `Cloth`(의복), `Jewelry`(장신구), `Book`(서적), `Fashion`(외형 의상), `Accessory`(보패·장식), `Cloak`(망토), `Hat`(머리장식)
- **카탈로그**: 48종 능력치, 1,794종 장비, 2,233종 일반 물품, 1,293종 무공, 223종 감오 노드, 15,814명 인물, 10,438종 버프, 457종 무림도감, 319종 업적, 83종 강자의 길 관문, 95개 지역, 62개 전송 거점 (한자·HTML/Unity 태그 0건 정제)
- **무림도감 · 무림일지**: `wulin_met_<id>` / `wulin_unlock_<id>` 조우·보너스 토글 및 `SSTS-WULINLOG-V2` 줄 편집
- **원클릭 프리셋 7종**: 은전·기혈·내력 부자(`rich_hero`), 전능력치 극한(`hero_max_stats`), 감오 전체 개방(`hero_all_talents`), 파티 전원 회복·정화(`party_heal_cleanse`), 전송 거점 전체 개방(`unlock_teleporters`), 보유 무공 숙련(`hero_master_skills`), 무림도감 전체 개방(`unlock_wulin_tujian`)

## 안전 장치

- `J2.exe` 실행 중 저장 차단 (`SSTS_SIMULATE_GAME_RUNNING=1` 시뮬레이션 지원)
- 덮어쓰기 전 원본 SHA-256 검증 `.bak` 백업 생성(`backup-yyyyMMdd-HHmmss-<hex>.bak`) 및 원자적 파일 교체
- 심볼릭 링크·디렉터리 정션·하드링크·NTFS ADS(`:` 스트림)·예약 장치명(`CON`, `NUL` 등)·UNC 경로 차단
- 로컬 웹 서버 `127.0.0.1` 고정 바인딩, `Host` / `Origin` / `Sec-Fetch-Site` 검증 및 `X-SSTS-Token` CSRF 방어

## 빠른 실행 및 검증 명령

```text
python3 tools/extract_catalog.py --check-only
python3 build.py --check
python3 ssts_editor.py presets
node tests/test_editor.cjs
python3 -W error -B -m unittest discover -s tests -v
```
