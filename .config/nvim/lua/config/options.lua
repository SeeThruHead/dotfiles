-- Options loaded before lazy.nvim
local opt = vim.opt

-- Line numbers
opt.number = true
opt.relativenumber = true

-- Indentation (2 spaces for TypeScript/JS)
opt.tabstop = 2
opt.shiftwidth = 2
opt.softtabstop = 2
opt.expandtab = true
opt.smartindent = true

-- Search
opt.ignorecase = true
opt.smartcase = true
opt.hlsearch = true
opt.incsearch = true

-- UI
opt.termguicolors = true
opt.signcolumn = "yes"
opt.cursorline = true
opt.scrolloff = 8
opt.sidescrolloff = 8
opt.wrap = false
opt.showmode = false -- status line handles this
opt.splitbelow = true
opt.splitright = true
opt.showtabline = 0 -- never show tabline
opt.hidden = false   -- close buffer when abandoned (no pile-up)

-- Files
opt.swapfile = false
opt.backup = false
opt.undofile = true
opt.undodir = vim.fn.stdpath("state") .. "/undo"

-- Auto-reload files changed outside nvim (LLM edits, git, etc.)
opt.autoread = true
opt.updatetime = 250

-- Clipboard
opt.clipboard = "unnamedplus"

-- Completion
opt.completeopt = { "menu", "menuone", "noselect" }

-- Misc
opt.mouse = "a"
opt.timeoutlen = 300
opt.conceallevel = 2 -- for markdown
