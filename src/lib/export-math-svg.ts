import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js";
import "mathjax-full/js/input/tex/textcomp/TextcompConfiguration.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document("", {
  InputJax: new TeX({ packages: ["base", "ams", "textmacros", "textcomp"], textmacros: { packages: ["text-base", "textcomp"] }, maxBuffer: 250000 }),
  OutputJax: new SVG({ fontCache: "none" }),
});

/** Bundled glyph outlines keep exported equations vector-based and independent of web fonts. */
export function mathSvg(latex: string, fontSize = 10) {
  const container = document.convert(latex, { display: true });
  const svg = adaptor.firstChild(container);
  if (!svg || adaptor.kind(svg) !== "svg") throw new Error("Unable to render the formula.");
  const node = svg as typeof container;
  const box = adaptor.getAttribute(node, "viewBox").split(/\s+/).map(Number);
  const width = box[2] * fontSize / 1000, height = box[3] * fontSize / 1000;
  adaptor.setAttribute(node, "width", String(width));
  adaptor.setAttribute(node, "height", String(height));
  adaptor.setAttribute(node, "xmlns", "http://www.w3.org/2000/svg");
  adaptor.setAttribute(node, "color", "black");
  adaptor.removeAttribute(node, "style");
  const source = adaptor.outerHTML(node);
  if (/data-mjx-error|data-mml-node="merror"/.test(source)) throw new Error("Unable to render the formula.");
  return { source, width, height };
}
