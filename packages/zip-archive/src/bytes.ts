import type { ByteSource } from './types';

/** `Blob`을 `ByteSource`로 감싼다. */
export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
    slice: (start, end) => blob.slice(start, end),
  };
}

export function toByteSource(input: Blob | ByteSource): ByteSource {
  return input instanceof Blob ? blobSource(input) : input;
}

/** 배열의 보이는 범위만 가리키는 DataView. 범위를 벗어나면 RangeError를 던진다. */
export function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
