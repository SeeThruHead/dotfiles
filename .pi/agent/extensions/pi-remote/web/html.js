// Tagged template binding — use `html` everywhere for Preact vnodes.

import { h, htm } from "./vendor.js";

export const html = htm.bind(h);
