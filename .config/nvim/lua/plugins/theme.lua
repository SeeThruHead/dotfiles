return {
  {
    "folke/tokyonight.nvim",
    lazy = false,
    priority = 1000,
    opts = {
      style = "night",
      transparent = true,
      terminal_colors = true,
      styles = {
        sidebars = "transparent",
        floats = "transparent",
        comments = { italic = true },
        keywords = { italic = true },
      },
      on_colors = function(colors)
        colors.border = "#444444"
      end,
      on_highlights = function(hl, c)
        hl.Normal = { bg = "NONE", fg = c.fg }
        hl.NormalSB = { bg = "NONE", fg = c.fg }
        hl.NormalFloat = { bg = "NONE", fg = c.fg }
        hl.NeoTreeNormal = { bg = "NONE", fg = c.fg }
        hl.NeoTreeNormalNC = { bg = "NONE", fg = c.fg }
        hl.WinSeparator = { fg = c.border }
        hl.FloatBorder = { bg = "NONE", fg = c.border }
        hl.StatusLine = { bg = "NONE", fg = c.fg }
        hl.StatusLineNC = { bg = "NONE", fg = c.comment }
      end,
    },
  },
  {
    "LazyVim/LazyVim",
    opts = { colorscheme = "tokyonight" },
  },
}
