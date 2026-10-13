#!/bin/bash
# zip-archive 테스트 샘플 ZIP을 실제 압축 도구(Info-ZIP zip, macOS ditto, Python zipfile)로 만든다.
# macOS에서만 돈다(ditto, xattr). 결과 ZIP을 커밋하고, CI에서는 다시 만들지 않는다.
set -euo pipefail
OUT="$(cd "$(dirname "$0")" && pwd)/zips"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
rm -rf "$OUT" && mkdir -p "$OUT"
cd "$WORK"

mkdir -p project/src project/data
printf 'print("hello")\n' > project/src/main.py
printf 'money = 0\n' > project/src/helpers.py
printf '1\n2\n3\n' > project/data/input.txt
printf 'hello\n%.0s' {1..200} > project/data/repeat.txt
chmod 755 project/src/main.py

zip -q -0 -r "$OUT/stored.zip" project
zip -q -r "$OUT/deflate.zip" project
zip -q -r -D "$OUT/no-dir-entries.zip" project
zip -q -r -fz "$OUT/zip64-small.zip" project
zip -q -P secret "$OUT/encrypted.zip" project/src/main.py
head -c 200000 /dev/urandom > big.bin
zip -q -s 64k "$OUT/split.zip" big.bin
rm -f "$OUT"/split.z0*

# macOS ditto(Finder 압축과 같은 방식): UTF-8 이름을 쓰면서 UTF-8 플래그를 켜지 않고,
# 데이터 기술자(bit 3)를 쓰며, __MACOSX/._파일을 넣는다.
mkdir -p finder/한글폴더
printf '안녕\n' > finder/한글폴더/노트.txt
xattr -w com.example.tag yes finder/한글폴더/노트.txt
ditto -c -k --sequesterRsrc --keepParent finder "$OUT/macos-ditto.zip"

python3 - "$OUT" <<'PY'
import sys, zipfile, zlib, struct, unicodedata
out = sys.argv[1]

class RawName(zipfile.ZipInfo):
    """이름 바이트와 UTF-8 플래그를 직접 정한다(옛 Windows 탐색기처럼 CP949·CP437 이름을 만들 때)."""
    def __init__(self, name, raw, system=0):
        super().__init__(name)
        self._raw = raw
        self.create_system = system
    def _encodeFilenameFlags(self):
        return self._raw, self.flag_bits & ~0x800

def write(path, infos):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for info, data in infos:
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)

write(f'{out}/cp949-names.zip', [(RawName('한글/문서.txt', '한글/문서.txt'.encode('cp949')), b'hi')])
write(f'{out}/cp437-names.zip', [(RawName('café.txt', 'café.txt'.encode('cp437')), b'hi')])
write(f'{out}/backslash-dos.zip', [(RawName('dir\\file.txt', b'dir\\file.txt', system=0), b'hi')])
nfd = unicodedata.normalize('NFD', '한글.txt').encode('utf-8')
write(f'{out}/nfd-names.zip', [(RawName('nfd', nfd, system=3), b'hi')])

raw = '보고서.txt'.encode('cp949')
body = bytes([1]) + struct.pack('<I', zlib.crc32(raw)) + '보고서.txt'.encode('utf-8')
info = RawName('보고서.txt', raw)
info.extra = struct.pack('<HH', 0x7075, len(body)) + body
write(f'{out}/unicode-path-extra.zip', [(info, b'hi')])

with zipfile.ZipFile(f'{out}/utf8-flag.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('한글/파일.txt', '내용'.encode('utf-8'))
with zipfile.ZipFile(f'{out}/bzip2.zip', 'w', zipfile.ZIP_BZIP2) as z:
    z.writestr('a.txt', b'bzip2 data')
PY
