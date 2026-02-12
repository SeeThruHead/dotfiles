-- lua/user/plugins/tokyonight.lua
return {
  "folke/tokyonight.nvim",
  opts = {
    style = "night",
    transparent = true, -- Enable transparency
    terminal_colors = true,
    styles = {
      sidebars = "transparent", -- Make sidebars transparent too
      floats = "transparent", -- Make floats transparent
      comments = { italic = true },
      keywords = { italic = true },
    },

    on_colors = function(colors)
      -- Make separator lines visible against transparent background
      colors.border = "#444444" -- Gray separator lines
      colors.border_highlight = "#555555"
    end,

    on_highlights = function(highlights, colors)
      -- Ensure all backgrounds are transparent
      highlights.Normal = { bg = "NONE", fg = colors.fg }
      highlights.NormalSB = { bg = "NONE", fg = colors.fg } -- Sidebars
      highlights.NormalFloat = { bg = "NONE", fg = colors.fg } -- Floats

      -- NeoTree specific
      highlights.NeoTreeNormal = { bg = "NONE", fg = colors.fg }
      highlights.NeoTreeNormalNC = { bg = "NONE", fg = colors.fg }

      -- Terminal
      highlights.TerminalNormal = { bg = "NONE" }

      -- Keep separator lines visible
      highlights.WinSeparator = { fg = colors.border }
      highlights.VertSplit = { fg = colors.border }
      highlights.NeoTreeWinSeparator = { fg = colors.border }

      -- Status lines transparent
      highlights.StatusLine = { bg = "NONE", fg = colors.fg }
      highlights.StatusLineNC = { bg = "NONE", fg = colors.comment }

      -- Float borders (you might want these slightly opaque for visibility)
      highlights.FloatBorder = { bg = "NONE", fg = colors.border }

      -- Optional: Make some UI elements slightly opaque for better readability
      -- highlights.Pmenu = { bg = colors.bg_popup } -- Popup menus
      -- highlights.PmenuSel = { bg = colors.bg_visual } -- Selected popup item
    end,
  },
}
