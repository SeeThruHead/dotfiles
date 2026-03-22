return {
  -- Disable bufferline (LazyVim default) — we use Tab to swap alternate buffer
  { "akinsho/bufferline.nvim", enabled = false },

  -- Neo-tree file explorer (auto-open on startup)
  {
    "nvim-neo-tree/neo-tree.nvim",
    opts = {
      open_on_setup = true,
      window = {
        position = "left",
        width = 35,
        mappings = {
          ["<C-h>"] = "none",
          ["<C-l>"] = function() vim.cmd("wincmd l") end,
        },
      },

      filesystem = {
        follow_current_file = { enabled = true },
        use_libuv_file_watcher = true,
        filtered_items = {
          visible = true,
          hide_dotfiles = false,
          hide_by_name = { "node_modules", ".git" },
        },
      },
    },
  },

  -- Telescope — use native fzf sorter (C, instant)
  {
    "nvim-telescope/telescope.nvim",
    dependencies = {
      { "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
    },
    opts = {
      defaults = {
        layout_strategy = "horizontal",
        layout_config = { horizontal = { preview_width = 0.55 }, prompt_position = "top" },
        sorting_strategy = "ascending",
        file_ignore_patterns = { "node_modules/", ".git/", "dist/", ".next/", "%.lock" },
        vimgrep_arguments = {
          "rg", "--color=never", "--no-heading", "--with-filename",
          "--line-number", "--column", "--smart-case", "--hidden",
          "--glob", "!.git/", "--glob", "!node_modules/",
        },
      },
      pickers = {
        find_files = {
          find_command = { "fd", "--type", "f", "--hidden", "--exclude", ".git", "--exclude", "node_modules" },
        },
      },
      extensions = {
        fzf = {
          fuzzy = true,
          override_generic_sorter = true,
          override_file_sorter = true,
          case_mode = "smart_case",
        },
      },
    },
    config = function(_, opts)
      local telescope = require("telescope")
      telescope.setup(opts)
      telescope.load_extension("fzf")
    end,
  },

  -- Gitsigns with inline blame
  {
    "lewis6991/gitsigns.nvim",
    opts = {
      current_line_blame = true,
      current_line_blame_opts = { delay = 500 },
    },
  },
}
