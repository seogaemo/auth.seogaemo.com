"""Seogaemo 심볼(public/brand/seogaemo-symbol.svg)로 app/favicon.ico, app/apple-icon.png를 만든다.

심볼은 두 정사각형을 합친 도형이라 외부 라이브러리 없이 직접 그린다.
사용: python3 -I scripts/build-icons.py
"""

import struct
import zlib
from pathlib import Path

INK = (16, 16, 22)  # #101016


def inside(x: float, y: float) -> bool:
    # viewBox 56 기준: (0,0)-(37.33,37.33) 와 (18.67,18.67)-(56,56) 의 합집합
    a = 0 <= x < 37.3333 and 0 <= y < 37.3333
    b = 18.6667 <= x < 56 and 18.6667 <= y < 56
    return a or b


def render(size: int, pad: float, background) -> bytes:
    """RGBA 픽셀. 4x4 슈퍼샘플링으로 가장자리를 부드럽게 한다."""
    rows = []
    inner = size - 2 * pad
    for py in range(size):
        row = bytearray()
        for px in range(size):
            hits = 0
            for sy in range(4):
                for sx in range(4):
                    x = (px + (sx + 0.5) / 4 - pad) / inner * 56
                    y = (py + (sy + 0.5) / 4 - pad) / inner * 56
                    hits += inside(x, y)
            cover = hits / 16
            if background:
                r, g, b = (round(INK[i] * cover + background[i] * (1 - cover)) for i in range(3))
                row += bytes((r, g, b, 255))
            else:
                row += bytes((*INK, round(255 * cover)))
        rows.append(bytes(row))
    return b"".join(b"\x00" + r for r in rows)


def png(size: int, pad: float, background=None) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(render(size, pad, background), 9))
        + chunk(b"IEND", b"")
    )


def ico(sizes) -> bytes:
    images = [png(s, s * 0.06) for s in sizes]
    head = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b""
    for s, data in zip(sizes, images):
        entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    return head + entries + b"".join(images)


if __name__ == "__main__":
    app = Path("app")
    (app / "favicon.ico").write_bytes(ico([16, 32, 48]))
    # iOS 홈 화면: 흰 배경, 여백을 넉넉히
    (app / "apple-icon.png").write_bytes(png(180, 40, background=(255, 255, 255)))
    print("app/favicon.ico, app/apple-icon.png")
