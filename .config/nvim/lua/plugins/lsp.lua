return {
  -- Mason — auto-install LSP servers, formatters, linters
  {
    "mason-org/mason.nvim",
    opts = {
      ensure_installed = {
        "typescript-language-server",
        "prettier",
        "eslint-lsp",
        "lua-language-server",
        "stylua",
        "shellcheck",
        "shfmt",
        "markdownlint-cli2",
        "json-lsp",
        "yaml-language-server",
        "tailwindcss-language-server",
        "css-lsp",
      },
    },
  },

  -- LSP
  {
    "neovim/nvim-lspconfig",
    opts = {
      inlay_hints = { enabled = true },
      diagnostics = {
        underline = true,
        update_in_insert = false,
        virtual_text = { spacing = 4, source = "if_many", prefix = "●" },
        severity_sort = true,
      },
      servers = {
        vtsls = {
          settings = {
            vtsls = {
              -- Use the project's TypeScript so it picks up @effect/language-service
              autoUseWorkspaceTsdk = true,
            },
            typescript = {
              tsserver = { maxTsServerMemory = 4096 },
              inlayHints = {
                parameterNames = { enabled = "all" },
                parameterTypes = { enabled = true },
                variableTypes = { enabled = true },
                propertyDeclarationTypes = { enabled = true },
                functionLikeReturnTypes = { enabled = true },
                enumMemberValues = { enabled = true },
              },
              preferences = { importModuleSpecifier = "non-relative" },
            },
          },
        },
      },
    },
  },

  -- Treesitter
  {
    "nvim-treesitter/nvim-treesitter",
    opts = {
      ensure_installed = {
        "bash", "css", "diff", "html", "javascript", "json", "jsonc",
        "kdl", "lua", "markdown", "markdown_inline",
        "regex", "toml", "tsx", "typescript", "vim", "vimdoc", "yaml",
      },
    },
  },
}
