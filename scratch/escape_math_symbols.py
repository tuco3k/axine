import os
import re

# Range to escape: U+2190 to U+2BFF and U+1F300 to U+1FAFF and U+FE0F
pattern = re.compile(r'[\U0001F300-\U0001FAFF\u2190-\u2BFF\uFE0F]')

src_dir = os.path.abspath('src')

for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith(('.ts', '.css')) and f != 'no_emoji.test.ts':
            filepath = os.path.join(root, f)
            with open(filepath, 'r', encoding='utf-8') as fh:
                content = fh.read()

            def repl(match):
                ch = match.group(0)
                code = ord(ch)
                if code > 0xFFFF:
                    return f"\\u{{{code:X}}}"
                else:
                    return f"\\u{code:04x}"

            new_content = pattern.sub(repl, content)

            # Special case for HTML string in editor.ts: \u222bdx in template -> &int;dx or Int dx
            new_content = new_content.replace('<span class="doc-logo">\\u222bdx</span>', '<span class="doc-logo">&int;dx</span>')

            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as fh:
                    fh.write(new_content)
                print(f"Updated {filepath}")
