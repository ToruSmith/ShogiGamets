#!/usr/bin/env bash
# 重新下載字型子集：Google Fonts 的 text= 參數只回傳指定字元的字型。
set -euo pipefail
cd "$(dirname "$0")/../src/assets/fonts"
CHARS='歩香桂銀金角飛王玉と杏圭全馬龍竜成将棋詰対局面通信譜検討設定勝負千日手投了切れみちけ先後一二三四五六七八九打同不盤駒落平分引きの時間反則宣言入番上下戦再開始'
TEXT=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$CHARS")
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"
for pair in "Shippori+Mincho+B1:wght@800|piece-mincho.woff2" "Yuji+Syuku|brush.woff2"; do
  family=${pair%%|*}
  out=${pair##*|}
  url=$(curl -sS -A "$UA" "https://fonts.googleapis.com/css2?family=$family&text=$TEXT" | grep -o 'https://fonts.gstatic.com[^)]*')
  curl -sS -o "$out" "$url"
done
