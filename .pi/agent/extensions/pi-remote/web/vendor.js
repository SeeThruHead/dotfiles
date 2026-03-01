// Re-export Preact, htm, and hljs so every module imports from one place.
// Changing CDN versions happens here, not scattered across files.

export { h, render } from "https://esm.sh/preact@10.25.4";
export { useState, useEffect, useRef, useCallback } from "https://esm.sh/preact@10.25.4/hooks";
export { default as htm } from "https://esm.sh/htm@3.1.1";

import hljs from "https://esm.sh/highlight.js@11.9.0/lib/core";
import javascript from "https://esm.sh/highlight.js@11.9.0/lib/languages/javascript";
import typescript from "https://esm.sh/highlight.js@11.9.0/lib/languages/typescript";
import python from "https://esm.sh/highlight.js@11.9.0/lib/languages/python";
import bashLang from "https://esm.sh/highlight.js@11.9.0/lib/languages/bash";
import jsonLang from "https://esm.sh/highlight.js@11.9.0/lib/languages/json";
import css from "https://esm.sh/highlight.js@11.9.0/lib/languages/css";
import xml from "https://esm.sh/highlight.js@11.9.0/lib/languages/xml";
import yaml from "https://esm.sh/highlight.js@11.9.0/lib/languages/yaml";
import markdown from "https://esm.sh/highlight.js@11.9.0/lib/languages/markdown";
import rust from "https://esm.sh/highlight.js@11.9.0/lib/languages/rust";
import go from "https://esm.sh/highlight.js@11.9.0/lib/languages/go";
import sql from "https://esm.sh/highlight.js@11.9.0/lib/languages/sql";
import diff from "https://esm.sh/highlight.js@11.9.0/lib/languages/diff";

const langs = {
  javascript, js: javascript, typescript, ts: typescript,
  python, py: python, bash: bashLang, sh: bashLang, shell: bashLang,
  json: jsonLang, css, html: xml, xml, yaml, yml: yaml,
  markdown, md: markdown, rust, rs: rust, go, sql, diff,
};

Object.entries(langs).forEach(([name, lang]) => hljs.registerLanguage(name, lang));

export { hljs };
