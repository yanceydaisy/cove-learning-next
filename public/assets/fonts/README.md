# Ephemeris Chinese serif font

Source: Google Fonts Noto Serif SC variable source (Google, SIL OFL 1.1).

- Font source: https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf
- License source: https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt
- License: NotoSerifSC-OFL.txt

The self-hosted WOFF2 retains the weight axis 400–600. It was subset with fontTools to Latin, general/CJK punctuation, CJK radicals, Bopomofo, CJK strokes, Extension A, unified ideographs U+4E00–9FFF, compatibility ideographs, vertical/fullwidth forms. This is a broad dynamic-content subset, not a list of screenshot words. Mapped codepoints: 28777.

Suggested face:

    @font-face {
      font-family: "Ephemeris Song";
      src: url("./assets/fonts/ephemeris-noto-serif-sc-400-600.woff2") format("woff2");
      font-style: normal;
      font-weight: 400 600;
      font-display: swap;
    }

Use the face before platform Songti/FangSong fallbacks. Wait for document.fonts before measuring the record pagination, and recompute it after the font face loads.
