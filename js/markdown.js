/* Lightweight Markdown -> HTML for dashboard notes: text is escaped first and
   URLs sanitized, so the result is safe for innerHTML. */
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
        if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return "#";
        return u;
    }

    function renderMarkdown(src) {
        if (src == null) return "";
        src = String(src).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // Stash protected HTML behind NUL tokens so escaping can't touch it.
        const stash = [];
        const keep = (html) => {
            stash.push(html);
            return "\u0000" + (stash.length - 1) + "\u0000";
        };

        src = src.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (m, lang, code) => {
            code = code.replace(/^\n/, "").replace(/\n$/, "");
            const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
            return keep(`<pre><code${langAttr}>${escapeHtml(code)}</code></pre>`);
        });

        src = src.replace(/`([^`\n]+)`/g, (m, code) => keep(`<code>${escapeHtml(code)}</code>`));

        src = src.replace(/<(https?:\/\/[^\s<>]+)>/g, (m, url) => {
            const safe = escapeHtml(sanitizeUrl(url));
            return keep(`<a href="${safe}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`);
        });

        // Runs on escaped text; URL capture allows one level of balanced parens.
        const inline = (text) => {
            let t = escapeHtml(text);
            t = t.replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^)\s]*\))*)(?:\s+"([^"]*)")?\)/g,
                (m, alt, url, title) => {
                    const tAttr = title ? ` title="${title}"` : "";
                    return `<img src="${sanitizeUrl(url)}" alt="${alt}"${tAttr}>`;
                });
            t = t.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^)\s]*\))*)(?:\s+"([^"]*)")?\)/g,
                (m, txt, url, title) => {
                    const tAttr = title ? ` title="${title}"` : "";
                    return `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer"${tAttr}>${txt}</a>`;
                });
            t = t.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
            t = t.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
            t = t.replace(/~~([^~]+?)~~/g, "<del>$1</del>");
            t = t.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
            t = t.replace(/(^|[^_\w])_([^_]+?)_(?!\w)/g, "$1<em>$2</em>");
            return t;
        };

        const lines = src.split("\n");
        const out = [];
        const n = lines.length;
        let i = 0;
        let taskSeq = 0; // stable across code-block stashing
        const isToken = (s) => /^\u0000\d+\u0000$/.test(s);

        while (i < n) {
            const line = lines[i];

            if (/^\s*$/.test(line)) { i++; continue; }

            if (isToken(line)) { out.push(line); i++; continue; }

            const h = line.match(/^(#{1,6})\s+(.*?)(?:\s+#{1,6})?$/);
            if (h) {
                const lvl = h[1].length;
                out.push("<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">");
                i++; continue;
            }

            if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
                out.push("<hr>");
                i++; continue;
            }

            if (/^>{1}\s?/.test(line)) {
                const quote = [];
                while (i < n && /^>{1}\s?/.test(lines[i])) {
                    quote.push(inline(lines[i].replace(/^>{1}\s?/, "")));
                    i++;
                }
                out.push("<blockquote>" + quote.join("<br>") + "</blockquote>");
                continue;
            }

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
                    // lazy continuation of the previous item
                    if (/^\s+\S/.test(lines[i]) && items.length) {
                        items[items.length - 1] += "<br>" + inline(lines[i].trim());
                        i++; continue;
                    }
                    break;
                }
                out.push("<ul>" + items.map((li) => li + "</li>").join("") + "</ul>");
                continue;
            }

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
        html = html.replace(/\u0000(\d+)\u0000/g, (m, idx) => stash[+idx] || "");
        return html;
    }

    window.renderMarkdown = renderMarkdown;
})();
