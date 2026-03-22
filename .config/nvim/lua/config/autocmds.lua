-- Autocmds

local autocmd = vim.api.nvim_create_autocmd
local augroup = vim.api.nvim_create_augroup

-- Auto-open Neo-tree on startup
autocmd("VimEnter", {
  group = augroup("OpenNeoTree", { clear = true }),
  callback = function()
    if vim.fn.argc() == 0 then
      vim.cmd("Neotree show")
    end
  end,
})

-- Auto-reload files when they change on disk (LLM edits, git operations, etc.)
local reload_group = augroup("AutoReload", { clear = true })

autocmd({ "FocusGained", "BufEnter", "CursorHold", "CursorHoldI" }, {
  group = reload_group,
  pattern = "*",
  callback = function()
    if vim.fn.getcmdwintype() == "" then
      vim.cmd("checktime")
    end
  end,
  desc = "Auto-reload files changed outside nvim",
})

autocmd("FileChangedShellPost", {
  group = reload_group,
  pattern = "*",
  callback = function()
    vim.notify("File changed on disk. Buffer reloaded.", vim.log.levels.INFO)
  end,
  desc = "Notify when file is reloaded",
})

-- Highlight on yank
autocmd("TextYankPost", {
  group = augroup("HighlightYank", { clear = true }),
  callback = function()
    vim.highlight.on_yank({ timeout = 200 })
  end,
})

-- Resize splits when window is resized
autocmd("VimResized", {
  group = augroup("ResizeSplits", { clear = true }),
  callback = function()
    vim.cmd("tabdo wincmd =")
  end,
})

-- Go to last cursor position when opening a file
autocmd("BufReadPost", {
  group = augroup("LastPosition", { clear = true }),
  callback = function(ev)
    local mark = vim.api.nvim_buf_get_mark(ev.buf, '"')
    local lcount = vim.api.nvim_buf_line_count(ev.buf)
    if mark[1] > 0 and mark[1] <= lcount then
      pcall(vim.api.nvim_win_set_cursor, 0, mark)
    end
  end,
})

-- Close some filetypes with <q>
autocmd("FileType", {
  group = augroup("CloseWithQ", { clear = true }),
  pattern = { "help", "lspinfo", "man", "notify", "qf", "startuptime", "checkhealth" },
  callback = function(ev)
    vim.bo[ev.buf].buflisted = false
    vim.keymap.set("n", "q", "<cmd>close<cr>", { buffer = ev.buf, silent = true })
  end,
})
