/*
CanvasRefined - lightweight Markdown renderer for dashboard notes.

Renders a small, notes-friendly subset of Markdown to HTML:
  headings, bold, italic, strikethrough, inline code, fenced code blocks,
  links, images, autolinks, blockquotes, ordered/unordered lists, task
  lists, horizontal rules, and paragraphs.

All user-supplied text is HTML-escaped before any formatting is applied,
and links/images are URL-sanitized, so the returned HTML is safe to assign
via innerHTML. Exposes window.renderMarkdown(text) -> html.
*/
(function () {
    "use strict";

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function sanitizeUrl(url) {
        const u = String(url == null ? "" : url).trim();
        if (u === "") return "";
        if (/^(https?:|mailto:|ftp:|tel:)/i.test(u)) return u;
        if (/^(javascript:|vbscript:|file:|data:)/i.test(u)) return "#";
        if (/^[#/?]/.test(u)) return u;
        // Block any other explicit protocol we did not whitelist.
        if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return "#";
        return u;
    }

    function renderMarkdown(src) {
        if (src == null) return "";
        src = String(src).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // Stash protected HTML (code blocks/spans, autolinks) behind NUL-delimited
        // tokens so they survive escaping and inline formatting untouched.
        const stash = [];
        const keep = (html) => {
            stash.push(html);
            return "\u0000" + (stash.length - 1) + "\u0000";
        };

        // 1. Fenced code blocks: ```lang\n code ```
        src = src.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (m, lang, code) => {
            code = code.replace(/^\n/, "").replace(/\n$/, "");
            const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
            return keep(`<pre><code${langAttr}>${escapeHtml(code)}</code></pre>`);
        });

        // 2. Inline code: `code`
        src = src.replace(/`([^`\n]+)`/g, (m, code) => keep(`<code>${escapeHtml(code)}</code>`));

        // 3. Autolinks: <https://example.com>
        src = src.replace(/<(https?:\/\/[^\s<>]+)>/g, (m, url) => {
            const safe = escapeHtml(sanitizeUrl(url));
            return keep(`<a href="${safe}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`);
        });

        // 4. Inline formatting, applied to escaped text so nothing the user
        //    typed can become live HTML. The URL capture allows one level of
        //    balanced parentheses, e.g. https://en.wikipedia.org/wiki/Foo_(bar).
        const inline = (text) => {
            let t = escapeHtml(text);
            // images: ![alt](url) or ![alt](url "title")
            t = t.replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^)\s]*\))*)(?:\s+"([^"]*)")?\)/g,
                (m, alt, url, title) => {
                    const tAttr = title ? ` title="${title}"` : "";
                    return `<img src="${sanitizeUrl(url)}" alt="${alt}"${tAttr}>`;
                });
            // links: [text](url) or [text](url "title")
            t = t.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^)\s]*\))*)(?:\s+"([^"]*)")?\)/g,
                (m, txt, url, title) => {
                    const tAttr = title ? ` title="${title}"` : "";
                    return `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer"${tAttr}>${txt}</a>`;
                });
            // bold: **text** or __text__
            t = t.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
            t = t.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
            // strikethrough: ~~text~~
            t = t.replace(/~~([^~]+?)~~/g, "<del>$1</del>");
            // italic: *text* (avoid *** by requiring non-star borders)
            t = t.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
            // italic: _text_ (skip word-internal underscores like file_name)
            t = t.replace(/(^|[^_\w])_([^_]+?)_(?!\w)/g, "$1<em>$2</em>");
            return t;
        };

        const lines = src.split("\n");
        const out = [];
        const n = lines.length;
        let i = 0;
        let taskSeq = 0; // ordinal of rendered task items, stable across code-block stashing
        const isToken = (s) => /^\u0000\d+\u0000$/.test(s);

        while (i < n) {
            const line = lines[i];

            // Blank line separates blocks.
            if (/^\s*$/.test(line)) { i++; continue; }

            // A stashed block (e.g. a fenced code block) sitting on its own line.
            if (isToken(line)) { out.push(line); i++; continue; }

            // ATX heading: # Title  (optional closing hashes)
            const h = line.match(/^(#{1,6})\s+(.*?)(?:\s+#{1,6})?$/);
            if (h) {
                const lvl = h[1].length;
                out.push("<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">");
                i++; continue;
            }

            // Horizontal rule: --- / *** / ___
            if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
                out.push("<hr>");
                i++; continue;
            }

            // Blockquote: > ...
            if (/^>{1}\s?/.test(line)) {
                const quote = [];
                while (i < n && /^>{1}\s?/.test(lines[i])) {
                    quote.push(inline(lines[i].replace(/^>{1}\s?/, "")));
                    i++;
                }
                out.push("<blockquote>" + quote.join("<br>") + "</blockquote>");
                continue;
            }

            // Unordered list: - / * / +  (supports task lists: - [ ] / - [x])
            if (/^\s*[-*+]\s+/.test(line)) {
                const items = [];
                while (i < n) {
                    const m = lines[i].match(/^\s*[-*+]\s+(.*)$/);
                    if (m) {
                        const task = m[1].match(/^\[([ xX])\]\s+(.*)$/);
                        if (task) {
                            const checked = /x/i.test(task[1]);
                            items.push(
                                '<li class="cr-task" data-cr-task="' + taskSeq++ + '"><input type="checkbox"' +
                                (checked ? " checked" : "") + "> " + inline(task[2])
                            );
                        } else {
                            items.push("<li>" + inline(m[1]));
                        }
                        i++; continue;
                    }
                    // Lazy continuation (indented) of the previous item.
                    if (/^\s+\S/.test(lines[i]) && items.length) {
                        items[items.length - 1] += "<br>" + inline(lines[i].trim());
                        i++; continue;
                    }
                    break;
                }
                out.push("<ul>" + items.map((li) => li + "</li>").join("") + "</ul>");
                continue;
            }

            // Ordered list: 1.
            if (/^\s*\d+\.\s+/.test(line)) {
                const items = [];
                while (i < n) {
                    const m = lines[i].match(/^\s*\d+\.\s+(.*)$/);
                    if (m) { items.push("<li>" + inline(m[1])); i++; continue; }
                    if (/^\s+\S/.test(lines[i]) && items.length) {
                        items[items.length - 1] += "<br>" + inline(lines[i].trim());
                        i++; continue;
                    }
                    break;
                }
                out.push("<ol>" + items.map((li) => li + "</li>").join("") + "</ol>");
                continue;
            }

            // Paragraph: gather consecutive lines until a block boundary.
            const para = [line];
            i++;
            while (i < n) {
                const l = lines[i];
                if (/^\s*$/.test(l)) break;
                if (isToken(l)) break;
                if (/^#{1,6}\s+/.test(l)) break;
                if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) break;
                if (/^>{1}\s?/.test(l)) break;
                if (/^\s*[-*+]\s+/.test(l)) break;
                if (/^\s*\d+\.\s+/.test(l)) break;
                para.push(l);
                i++;
            }
            out.push("<p>" + para.map(inline).join("<br>") + "</p>");
        }

        let html = out.join("\n");
        // Restore stashed HTML.
        html = html.replace(/\u0000(\d+)\u0000/g, (m, idx) => stash[+idx] || "");
        return html;
    }

    window.renderMarkdown = renderMarkdown;
})();
