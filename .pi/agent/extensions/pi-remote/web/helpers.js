// Pure utility functions — no DOM, no state, no side effects.

export const relativeTime = (iso) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? hrs + "h ago" : Math.floor(hrs / 24) + "d ago";
};

export const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const extractText = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.filter((c) => c.type === "text").map((c) => c.text).join("")
      : "";

export const toolArgsSummary = (name, args) => {
  if (!args) return "";
  if (name === "bash" && args.command) return args.command.substring(0, 80);
  if (["read", "write", "edit"].includes(name) && args.path) return args.path;
  if (name === "grep" && args.pattern) return args.pattern + " " + (args.path || "");
  if (["find", "ls"].includes(name) && args.path) return args.path;
  return JSON.stringify(args).substring(0, 60);
};
