import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = process.cwd();
const mdPath = path.join(rootDir, "SWASTHYASETU_MASTER_CONTEXT.md");
const outPdfPath = path.join(rootDir, "SWASTHYASETU_MASTER_CONTEXT.pdf");
const tempHtmlPath = path.join(rootDir, "scripts", "temp_master_context.html");
const rawHtmlPath = path.join(rootDir, "scripts", "raw_marked_context.html");

if (!fs.existsSync(mdPath)) {
  console.error("Markdown file not found:", mdPath);
  process.exit(1);
}

console.log("1. Converting Markdown to HTML via marked CLI (file input)...");
execSync(`npx -y marked --gfm -i "${mdPath}" -o "${rawHtmlPath}"`);
const rawHtml = fs.readFileSync(rawHtmlPath, "utf-8");
fs.unlinkSync(rawHtmlPath);

console.log(`Converted HTML length: ${rawHtml.length} characters.`);

console.log("2. Processing Mermaid blocks and unescaping HTML entities...");
const processedHtml = rawHtml.replace(
  /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
  (match, p1) => {
    // Unescape HTML entities that marked introduced
    const unescaped = p1
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    return `<div class="mermaid-container"><div class="mermaid">${unescaped}</div></div>`;
  }
);

console.log("3. Assembling complete HTML with modern typography & print styling...");
const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SwasthyaSetu — Master Project Context & Architectural Specification</title>
  
  <!-- KaTeX CSS & JS for Math rendering -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"></script>
  
  <!-- Mermaid.js -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>

  <style>
    @page {
      size: A4 portrait;
      margin: 18mm 16mm 18mm 16mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 12.5px;
      line-height: 1.6;
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }

    /* Headings */
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 2px solid #cbd5e1;
      padding-bottom: 8px;
      margin-top: 32px;
      margin-bottom: 14px;
      page-break-after: avoid;
    }

    h2 {
      font-size: 17px;
      font-weight: 600;
      color: #1e293b;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 5px;
      margin-top: 26px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }

    h3 {
      font-size: 14.5px;
      font-weight: 600;
      color: #334155;
      margin-top: 20px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }

    h4 {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      margin-top: 16px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }

    p {
      margin-top: 0;
      margin-bottom: 10px;
    }

    /* Links */
    a {
      color: #0284c7;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }

    /* Blockquotes */
    blockquote {
      border-left: 4px solid #0284c7;
      background-color: #f8fafc;
      color: #334155;
      padding: 8px 14px;
      margin: 14px 0;
      border-radius: 0 6px 6px 0;
      page-break-inside: avoid;
    }
    blockquote p:last-child {
      margin-bottom: 0;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 11px;
      page-break-inside: avoid;
    }

    th {
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
      text-align: left;
      padding: 6px 8px;
      border: 1px solid #cbd5e1;
    }

    td {
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }

    tr:nth-child(even) td {
      background-color: #f8fafc;
    }

    /* Code Blocks */
    pre {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      overflow-x: auto;
      font-size: 10.5px;
      line-height: 1.45;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      margin: 12px 0;
      page-break-inside: avoid;
    }

    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      background-color: #f1f5f9;
      padding: 2px 4px;
      border-radius: 4px;
      color: #0f172a;
    }

    pre code {
      background-color: transparent;
      padding: 0;
      border-radius: 0;
    }

    /* Lists */
    ul, ol {
      margin-top: 0;
      margin-bottom: 10px;
      padding-left: 20px;
    }

    li {
      margin-bottom: 3px;
    }

    /* Horizontal Rules */
    hr {
      border: 0;
      height: 1px;
      background-color: #e2e8f0;
      margin: 24px 0;
    }

    /* Mermaid Diagrams */
    .mermaid-container {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 18px 0;
      padding: 12px;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      page-break-inside: avoid;
    }

    .mermaid {
      max-width: 100%;
    }

    .mermaid svg {
      max-width: 100% !important;
      height: auto !important;
    }

    /* Print Tweaks */
    @media print {
      body {
        font-size: 11px;
        line-height: 1.45;
        color: #0f172a;
      }
      h1 {
        font-size: 18px;
        margin-top: 24px;
      }
      h2 {
        font-size: 14.5px;
        margin-top: 20px;
      }
      h3 {
        font-size: 13px;
        margin-top: 16px;
      }
      pre {
        font-size: 9.5px;
        padding: 8px 10px;
      }
      table {
        font-size: 10px;
      }
      th, td {
        padding: 4px 6px;
      }
      .mermaid-container {
        padding: 6px;
        margin: 12px 0;
      }
    }
  </style>
</head>
<body>
  ${processedHtml}

  <script>
    document.addEventListener("DOMContentLoaded", async () => {
      // 1. Render KaTeX math equations
      if (window.renderMathInElement) {
        try {
          renderMathInElement(document.body, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false }
            ],
            throwOnError: false
          });
        } catch (e) {
          console.warn("KaTeX render error:", e);
        }
      }

      // 2. Initialize and run Mermaid safely per container
      if (window.mermaid) {
        try {
          mermaid.initialize({
            startOnLoad: false,
            theme: "neutral",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            securityLevel: "loose"
          });
          
          const mermaidNodes = document.querySelectorAll(".mermaid");
          for (let i = 0; i < mermaidNodes.length; i++) {
            const node = mermaidNodes[i];
            try {
              await mermaid.run({ nodes: [node] });
            } catch (diagramErr) {
              console.warn("Diagram render warning for node " + i + ":", diagramErr);
            }
          }
        } catch (err) {
          console.error("Mermaid general error:", err);
        }
      }

      window.status = "READY_TO_PRINT";
    });
  </script>
</body>
</html>`;

fs.mkdirSync(path.dirname(tempHtmlPath), { recursive: true });
fs.writeFileSync(tempHtmlPath, fullHtml, "utf-8");
console.log("4. Full HTML written to:", tempHtmlPath);

console.log("5. Launching Google Chrome headless to print PDF...");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeArgs = [
  "--headless=new",
  "--disable-gpu",
  "--no-pdf-header-footer",
  "--virtual-time-budget=5000",
  "--run-all-compositor-stages-before-draw",
  `--print-to-pdf=${outPdfPath}`,
  tempHtmlPath,
];

try {
  execSync(`"${chromePath}" ${chromeArgs.join(" ")}`, {
    stdio: "inherit",
    timeout: 60000,
  });
  console.log("6. Chrome PDF generation complete!");
} catch (err) {
  console.error("Error generating PDF with Chrome:", err);
} finally {
  if (fs.existsSync(tempHtmlPath)) {
    fs.unlinkSync(tempHtmlPath);
  }
}

if (fs.existsSync(outPdfPath)) {
  const stats = fs.statSync(outPdfPath);
  console.log(`\n🎉 SUCCESS! PDF created at: ${outPdfPath}`);
  console.log(`📊 File Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB (${stats.size} bytes)`);
} else {
  console.error("❌ PDF generation failed: output file not found.");
  process.exit(1);
}
