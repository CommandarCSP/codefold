/** 판단에 쓰는 최대 바이트 수. 호출하는 쪽은 이만큼만 압축을 풀면 된다. */
export const HEAD_SIZE = 8192;

/** 이 크기를 넘으면 Monaco가 구문 강조와 접기를 끈다. */
export const LARGE_TEXT_BYTES = 20 * 1024 * 1024;

/** 이 크기를 넘으면 Monaco가 model을 언어 worker로 보내지 않는다. */
export const HUGE_TEXT_BYTES = 50 * 1024 * 1024;
