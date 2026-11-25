"""public/fonts의 woff2 서브셋을 만든다.

mono: Monoplex KR
- 원본: https://github.com/y-kim/monoplex/releases (monoplex-kr-1.3.0, SIL OFL 1.1)
- OFL상 "Monoplex"는 예약 이름이라 서브셋은 SeogaemoMono라는 이름으로 내보낸다.

sans: LINE Seed Sans KR (기본 글꼴)
- 원본: https://seed.line.me/index_kr.html 의 LINE_Seed_Sans_KR.zip (2023.09.06, SIL OFL 1.1)
- 예약 이름이 없어 이름은 그대로 둔다.
- 원본 세로 값(typo 750/-250)대로면 글자가 줄 가운데보다 0.12em 위에 그려져서 버튼, 입력칸 글자가 위로 쏠린다.
  대문자 높이(734)의 가운데가 줄 가운데에 오도록 ascender 967, descender -233으로 바꾼다
  (Pretendard도 이렇게 가운데에 맞춰져 있다). Safari는 CSS ascent-override를 몰라 파일에서 고친다.

글자는 둘 다 ASCII + 자주 쓰는 문장부호, 화살표 + KS X 1001 한글 2350자.
나머지 한글은 CSS에서 Pretendard로 이어 그린다.

사용 (fonttools, brotli 필요):
  python3 -I scripts/build-font.py mono <MonoplexKR 압축 푼 폴더> public/fonts
  python3 -I scripts/build-font.py sans <LINE_SeedKR_2023.09.06/TTF 폴더> public/fonts
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

# 종류별 (원본 파일 이름, 내보낼 파일 이름, 글꼴 안의 이름을 바꿀지)
FONTS = {
    "mono": [
        (f"MonoplexKR-{style}.ttf", f"SeogaemoMono-{style}.woff2", ("SeogaemoMono", style))
        for style in ("Text", "Medium", "SemiBold")
    ],
    "sans": [
        (f"LINESeedKR-{short}.ttf", f"LINESeedSansKR-{style}.woff2", None)
        for short, style in (("Rg", "Regular"), ("Bd", "Bold"))
    ],
}


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


def rename(font: TTFont, family: str, style: str):
    full = f"{family} {style}"
    ps = f"{family}-{style}"
    for record in font["name"].names:
        if record.nameID in (1, 16):
            record.string = family
        elif record.nameID in (2, 17):
            record.string = style
        elif record.nameID == 4:
            record.string = full
        elif record.nameID == 6:
            record.string = ps
        elif record.nameID == 3:
            record.string = f"{ps};subset"


def center_on_cap_height(font: TTFont):
    """ascender - descender = 대문자 높이가 되게 해서 줄 높이와 상관없이 글자를 가운데에 둔다"""
    os2, hhea = font["OS/2"], font["hhea"]
    upm = font["head"].unitsPerEm
    total = round(upm * 1.2)
    ascender = (total + os2.sCapHeight) // 2
    descender = ascender - total
    os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = ascender, descender, 0
    hhea.ascent, hhea.descent, hhea.lineGap = ascender, descender, 0


def main(kind: str, source: Path, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    unicodes = codepoints()

    for src_name, dest_name, new_name in FONTS[kind]:
        src = source / src_name
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.notdef_outline = True

        font = subset.load_font(str(src), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=unicodes)
        subsetter.subset(font)
        if new_name:
            rename(font, *new_name)
        if kind == "sans":
            center_on_cap_height(font)

        dest = out / dest_name
        subset.save_font(font, str(dest), options)
        print(f"{dest} {dest.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]))
