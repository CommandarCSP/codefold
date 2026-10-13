# ADR-0035. 라이브러리 안의 확인창은 nice-modal 없이 띄운다

- 상태: 승인
- 날짜: 2026-09-27
- 일부 대체: ADR-0012의 "확인창은 nice-modal-react로 관리한다"(적용 범위를 앱으로 좁힌다)

## 배경

ADR-0012는 확인창을 nice-modal-react로 관리하기로 했다. `<CodeEditor>` 안의 확인창(고친 파일이나 고친 파일이 든 폴더의 삭제, 변경 되돌리기)도 같은 방식으로 관리하되, 쓰는 쪽이 nice-modal Provider를 두지 않아도 동작해야 한다.

그래서 `@codefold/react-code-editor`의 트리 패널 안에 `NiceModal.Provider`를 두었는데, 최종 리뷰에서 이 Provider가 쓰는 쪽의 확인창을 깨뜨린다는 사실이 드러났다.

- nice-modal-react는 모달을 띄우는 함수(`dispatch`)를 모듈 전역 변수 하나에 둔다. 마지막에 그려진 Provider가 그 자리를 차지한다.
- 앱도 nice-modal을 쓴다(새 ZIP 교체 확인 등). 앱이 `NiceModal.show`로 띄운 창이 에디터 안의 Provider에서 그려지고, 새 ZIP을 열어 에디터가 다시 마운트되면 그 창이 사라진다. 앱이 기다리던 `NiceModal.show`의 Promise도 끝나지 않는다.
- 한 페이지에 에디터가 둘이면 나중에 그려진 에디터의 Provider가 두 에디터의 확인창을 모두 그린다.

라이브러리가 Provider를 두지 않고 쓰는 쪽에 Provider를 요구하면, "Provider 없이 동작"을 어기고 외부 사용처에 할 일이 하나 는다.

## 선택지

라이브러리 안의 확인창을 어떻게 띄울지 두 가지를 비교했다.

| 선택지 | 장점 | 단점 |
|---|---|---|
| A. 라이브러리 안의 확인창은 Radix AlertDialog를 직접 쓰고, 열림 상태는 그 패널의 상태로 둔다 | 쓰는 쪽의 nice-modal과 섞이지 않는다. Provider가 필요 없다. 확인창 모양과 동작은 지금과 같다 | 라이브러리와 앱의 확인창 관리 방식이 다르다 |
| B. 라이브러리는 Provider를 두지 않고, 쓰는 쪽이 nice-modal Provider를 반드시 둔다 | 앱과 같은 방식(nice-modal)을 라이브러리에도 그대로 쓴다 | "Provider 없이 동작"을 어긴다. 외부 사용처가 nice-modal을 설치하고 Provider를 둬야 한다 |

## 결정

**A를 택한다.**

- `@codefold/react-code-editor`는 nice-modal-react에 의존하지 않는다. 확인창은 Radix AlertDialog로 그리고, 확인·취소를 Promise로 돌려주는 작은 훅(`useConfirm`)으로 띄운다.
- 앱(`apps/zip-editor`)의 확인창은 지금처럼 nice-modal-react로 관리한다(ADR-0012).

## 근거

- 라이브러리는 쓰는 쪽의 전역 상태를 건드리지 않아야 한다. nice-modal은 `dispatch`를 전역 변수 하나에 두므로, 라이브러리 안에 Provider를 두면 쓰는 쪽의 Provider와 부딪친다.
- 확인창 하나에 필요한 것은 "열고, 확인이나 취소를 기다린다"뿐이라, 컴포넌트 안의 상태로 충분하다.

## 결과

- react-code-editor의 `package.json`에서 `@ebay/nice-modal-react`를 뺀다.
- 쓰는 쪽이 nice-modal Provider를 두어도, 두지 않아도 에디터 확인창이 동작하고 쓰는 쪽의 모달과 섞이지 않는다는 테스트를 둔다.
