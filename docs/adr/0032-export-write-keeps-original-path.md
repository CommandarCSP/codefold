# ADR-0032. 내보내기 계획의 "새 내용" 항목에 원래 경로를 적는다

- 상태: 승인
- 날짜: 2026-09-27
- 일부 보완: 내보내기 계획의 `ExportEntry`

## 배경

다운로드할 때 파일마다 "원본 복사(`copy`)"와 "새 내용(`write`)" 가운데 하나를 고른다. `copy`에는 원래 경로(`originalPath`)가 있지만 `write`에는 새 경로만 있다.

ZIP 항목에는 내용 말고도 원래 속성이 있다. 셸 스크립트의 실행 권한 같은 Unix 권한이 그 예이고, 이 속성은 만든 운영체제 값(`versionMadeBy`)과 짝을 이룬다. `@codefold/zip-archive`의 `writeZip`은 새 내용을 쓸 때 원본 항목의 속성을 `attributesFrom`으로 이어받을 수 있다.

그런데 `write` 항목에는 원래 경로가 없다. 이름을 바꾼 뒤 내용까지 고친 파일은 새 경로로 원본 항목을 찾을 수 없다. 그 파일은 속성을 잃고 일반 파일(0644)로 저장된다. `run.sh`의 이름을 `start.sh`로 바꾸고 한 줄 고쳐서 받으면, 받은 사람은 그 스크립트를 바로 실행할 수 없다.

## 결정

`write` 항목에 원래 경로를 적는다. 새로 만든 파일은 원래 경로가 없다.

```ts
type ExportEntry =
  | { type: 'copy'; path: string; originalPath: string }    // 원본 압축 바이트를 path 이름으로 복사
  | { type: 'write'; path: string; originalPath?: string }; // 새 내용. originalPath가 있으면 그 항목의 속성을 이어받는다
```

- virtual-fs가 계획을 만들 때, 원본 ZIP에서 온 파일이면 이름 변경 이력을 거슬러 올라가 원래 경로를 채운다. 새로 만든 파일은 비워 둔다.
- ZIP Worker의 `exportZip`은 `originalPath`가 있으면 그 원본 항목을 `writeZip`의 `attributesFrom`으로 넘긴다. 없으면 일반 파일 속성으로 쓴다.
- 수정 시각은 새로 쓴 시각이다. 원래 경로로 이어받는 것은 속성(권한과 만든 운영체제)뿐이다.

## 근거

- 사용자는 파일 내용을 고쳤을 뿐 권한을 바꾸지 않았다. 다운로드한 ZIP에서 권한이 사라지면 사용자가 모르는 사이에 결과가 달라진다.
- `copy`에 이미 `originalPath`가 있으므로 같은 이름의 필드를 선택 값으로 더하는 것이 가장 작은 변경이다. 계획은 여전히 순수 데이터라 Worker로 그대로 보낼 수 있다(ADR-0017, ADR-0028).
- 속성을 찾는 일은 원본 목록이 있는 Worker가 한다. 메인 스레드는 원본 항목을 몰라도 된다.

## 결과

- `ExportEntry`의 `write` 항목에 원래 경로를 둔다.
- virtual-fs 계획에는 이름 변경 이력으로 `originalPath`를 채우는지 확인하는 테스트를 둔다. 이름을 바꾼 뒤 고친 실행 파일을 받으면 실행 권한이 남아 있어야 한다.
- 원래 경로를 잘못 채우면 다른 파일의 속성이 붙는다. virtual-fs 테스트에서 이름 변경·삭제 뒤 같은 이름으로 새로 만든 경우를 따로 확인한다. 그런 파일은 새 파일이므로 `originalPath`가 없다.
