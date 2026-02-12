return {
  "nvim-neo-tree/neo-tree.nvim",
  opts = {
    window = {
      position = "left",
      mappings = {
        -- Don't override the default navigation keys
        ["<C-h>"] = "none", -- Let LazyVim handle this
        ["<C-l>"] = "none", -- Let LazyVim handle this
      },
    },
  },
}
