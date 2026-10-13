# ADR-0033. 다운로드 ZIP에 빈 폴더를 남긴다

- 상태: 승인
- 날짜: 2026-09-27
- 일부 보완: 내보내기 계획의 `ExportEntry`, ADR-0032

## 배경

다운로드 계획의 항목(`ExportEntry`)에는 "원본 복사(`copy`)"와 "새 내용(`write`)"만 있다. 폴더는 그 안의 파일 경로로만 ZIP에 들어간다. 그래서 파일이 없는 폴더는 다운로드한 ZIP에서 사라진다.

- 사용자가 "새 폴더"로 만들었지만 아직 파일을 넣지 않은 폴더
- 원본 ZIP에 원래 있던 빈 폴더(예: `logs/`, `uploads/`)

트리에서 보던 폴더가 받은 ZIP을 다시 열면 없다. ZIP을 올리고 아무것도 고치지 않고 받아도 원본의 빈 폴더가 빠진다. `@codefold/zip-archive`의 `writeZip`은 이미 폴더 항목(`{ type: 'directory', path }`)을 쓸 수 있다.

## 결정

내보내기 계획에 폴더 항목을 더한다.

```ts
type ExportEntry =
  | { type: 'copy'; path: string; originalPath: string }
  | { type: 'write'; path: string; originalPath?: string }
  | { type: 'directory'; path: string };  // 안에 아무것도 없는 폴더. 경로 끝에 `/`를 붙이지 않는다
```

- virtual-fs는 계획의 다른 항목(`copy`·`write`) 가운데 그 폴더 아래 경로가 하나도 없는 폴더만 `directory` 항목으로 넣는다. 파일이 든 폴더는 지금처럼 자식의 경로로 따라 들어간다.
- 무시 목록(`__MACOSX/` 등)에 걸린 항목은 트리에 없어도 원본 복사 항목으로 계획에 들어간다. 그래서 그런 항목만 든 폴더는 트리에서 비어 보여도 `directory` 항목으로 넣지 않는다.
- ZIP Worker의 `exportZip`은 `directory` 항목을 `writeZip`의 폴더 항목으로 넘긴다.

## 근거

- 사용자는 트리에서 보던 구조가 받은 ZIP에도 그대로 있기를 기대한다. 원본을 그대로 받았는데 폴더가 빠지면 이 편집기가 ZIP을 망가뜨린다고 느낀다.
- 빈 폴더만 넣으므로 계획의 크기는 지금처럼 파일 수에 비례한다. 1만 개 항목 ZIP에서도 폴더 항목 때문에 계획이 크게 늘지 않는다.
- 폴더 항목은 순수 데이터라 Worker로 그대로 보낼 수 있다(ADR-0017, ADR-0028).

## 결과

- `ExportEntry`에 폴더 항목을 둔다. 빈 폴더가 다운로드한 ZIP에 남는지 테스트로 확인한다.
- virtual-fs 계획에는 빈 폴더(새로 만든 것, 원본에 있던 것, 안의 파일을 모두 지워 빈 것)가 `directory` 항목으로 나오는지 확인하는 테스트를 둔다.
- 원본의 빈 폴더가 가진 속성(권한, 수정 시각)은 이어받지 않는다. 폴더 항목의 수정 시각은 ZIP을 쓴 시각이고, 권한은 기본값이다.
