"""Monoplex KR에서 로그인 화면용 woff2 서브셋을 만든다.

- 원본: https://github.com/y-kim/monoplex/releases (monoplex-kr-1.3.0, SIL OFL 1.1)
- 글자: ASCII + 자주 쓰는 문장부호, 화살표 + KS X 1001 한글 2350자
- OFL상 "Monoplex"는 예약 이름이라 서브셋은 SeogaemoMono라는 이름으로 내보낸다.

사용 (fonttools, brotli 필요):
  python3 -I scripts/build-font.py <MonoplexKR 압축 푼 폴더> public/fonts
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

FAMILY = "SeogaemoMono"
WEIGHTS = {"Text": 450, "Medium": 500, "SemiBold": 600}


def hangul_ksx1001():
    chars = []
    for lead in range(0xB0, 0xC9):
        for trail in range(0xA1, 0xFF):
            try:
                chars.append(bytes([lead, trail]).decode("euc-kr"))
            except UnicodeDecodeError:
                pass
    return chars


def codepoints():
    points = set(range(0x20, 0x7F))  # ASCII
    points |= {0xA0, 0xB7}  # nbsp, middle dot
    points |= set(range(0x2010, 0x2027))  # 대시, 따옴표, 말줄임표
    points |= set(range(0x2190, 0x2194))  # 화살표 ← ↑ → ↓
    points |= set(range(0x3131, 0x3164))  # 한글 호환 자모 (ㄱ, ㅏ ...)
    points |= {ord(c) for c in hangul_ksx1001()}
    return points


def rename(font: TTFont, style: str):
    full = f"{FAMILY} {style}"
    ps = f"{FAMILY}-{style}"
    for record in font["name"].names:
        if record.nameID in (1, 16):
            record.string = FAMILY
        elif record.nameID in (2, 17):
            record.string = style
        elif record.nameID == 4:
            record.string = full
        elif record.nameID == 6:
            record.string = ps
        elif record.nameID == 3:
            record.string = f"{ps};subset"


def main(source: Path, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    unicodes = codepoints()

    for style in WEIGHTS:
        src = source / f"MonoplexKR-{style}.ttf"
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.notdef_outline = True

        font = subset.load_font(str(src), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=unicodes)
        subsetter.subset(font)
        rename(font, style)

        dest = out / f"{FAMILY}-{style}.woff2"
        subset.save_font(font, str(dest), options)
        print(f"{dest} {dest.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
