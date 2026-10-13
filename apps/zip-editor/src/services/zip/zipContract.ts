import type { FileSource, FileSourceEntry } from '@codefold/virtual-fs';
import type { ZipArchive, ZipEntry } from '@codefold/zip-archive';

/**
 * 컴파일할 때만 쓰는 모양 검사. 두 패키지는 서로 import하지 않고 구조적 타입으로 맞춘다(ADR-0016).
 * 어느 한쪽 모양이 바뀌어 어긋나면 여기서 타입 오류가 난다.
 */
type Assert<T extends true> = T;
export type ZipArchiveIsFileSource = Assert<ZipArchive extends FileSource ? true : false>;
export type ZipEntryIsFileSourceEntry = Assert<ZipEntry extends FileSourceEntry ? true : false>;
