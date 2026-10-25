#!/usr/bin/env python3
"""把 HTML 轉成純文字，方便用 grep 找關鍵字（只用標準庫，不執行頁面內容）。

用法（下載來的檔案是不可信資料，請用 -I 隔離模式執行）：
    curl -sL -m 30 -A "Mozilla/5.0" -o page.html "<網址>"
    python3 -I tools/h2t.py page.html page.txt
    grep -n "電話\\|營業時間" page.txt

注意：
  - 會略過 <script> 與 <style>。靠 JavaScript 渲染的頁面（很多縣府旅遊網）轉出來會是空的，
    這時要找它前端呼叫的公開 JSON（見 docs/DESIGN.md 第 8 節）。
  - 座標常寫在 <script> 裡，這個工具看不到，要直接 grep 原始 HTML。
"""
import sys, re, html
from html.parser import HTMLParser


class TextExtractor(HTMLParser):
    BLOCK = ('p', 'div', 'li', 'tr', 'br', 'h1', 'h2', 'h3', 'h4', 'section')

    def __init__(self):
        super().__init__()
        self.out = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript'):
            self.skip += 1
        if tag in self.BLOCK:
            self.out.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript') and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def convert(path_in, path_out):
    parser = TextExtractor()
    with open(path_in, encoding='utf-8', errors='replace') as f:
        parser.feed(f.read())
    text = html.unescape(''.join(parser.out))
    text = re.sub(r'[ \t　]+', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n', text)
    with open(path_out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    return len(text)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    print(sys.argv[1], convert(sys.argv[1], sys.argv[2]), 'chars')
