-- Keymaps (loaded after lazy.nvim)
local map = vim.keymap.set

-- Tab to switch to last buffer
map("n", "<Tab>", "<cmd>e #<cr>", { desc = "Switch to last buffer" })

-- Move lines up/down in visual mode
map("v", "J", ":m '>+1<CR>gv=gv", { desc = "Move line down" })
map("v", "K", ":m '<-2<CR>gv=gv", { desc = "Move line up" })

-- Keep cursor centered when scrolling
map("n", "<C-d>", "<C-d>zz")
map("n", "<C-u>", "<C-u>zz")

-- Keep search results centered
map("n", "n", "nzzzv")
map("n", "N", "Nzzzv")

-- Better paste (don't lose clipboard when pasting over selection)
map("x", "<leader>p", '"_dP', { desc = "Paste without losing clipboard" })

-- Quick save / quit
map("n", "<leader>w", "<cmd>w<cr>", { desc = "Save file" })
map("n", "<leader>q", "<cmd>q<cr>", { desc = "Quit" })
map("n", "<leader>Q", "<cmd>qa!<cr>", { desc = "Quit all" })

-- Clear search highlight
map("n", "<Esc>", "<cmd>noh<cr><Esc>", { desc = "Clear search highlight" })
