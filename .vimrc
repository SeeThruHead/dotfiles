let g:python2_host_prog = '/usr/local/bin/python'
let g:python3_host_prog = '/usr/local/bin/python3'

set nocompatible              " be iMproved, required
filetype off                  " required

call plug#begin('~/.vim/plugged')

Plug 'vim-airline/vim-airline'
Plug 'vim-airline/vim-airline-themes'
Plug 'edkolev/tmuxline.vim'
Plug 'edkolev/promptline.vim'
Plug 'christoomey/vim-tmux-navigator'
Plug 'terryma/vim-expand-region'
Plug 'chriskempson/base16-vim'
Plug 'raimondi/delimitmate'
Plug 'scrooloose/nerdtree'
Plug 'kien/ctrlp.vim'
Plug 'godlygeek/tabular'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-repeat'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-rails'
Plug 'w0rp/ale'
Plug 'tpope/vim-dispatch'
Plug 'ngmy/vim-rubocop'
Plug 'elixir-lang/vim-elixir'
Plug 'airblade/vim-gitgutter'

Plug 'autozimu/LanguageClient-neovim', {
    \ 'branch': 'next',
    \ 'do': 'bash install.sh',
    \ }

if has('nvim')
  Plug 'Shougo/deoplete.nvim', { 'do': ':UpdateRemotePlugins' }
else
  Plug 'Shougo/deoplete.nvim'
  Plug 'roxma/nvim-yarp'
  Plug 'roxma/vim-hug-neovim-rpc'
endif

Plug 'junegunn/fzf', { 'dir': '~/.fzf', 'do': './install --all' }
Plug 'junegunn/fzf.vim'

" Reason stuff
Plug 'reasonml-editor/vim-reason-plus'

" Javascript Stuff
Plug 'mxw/vim-jsx'
Plug 'seethruhead/vim-react-snippets'
Plug 'jelera/vim-javascript-syntax'
Plug 'pangloss/vim-javascript'
Plug 'vim-scripts/tComment'
Plug 'carlitux/deoplete-ternjs'
" Plug 'styled-components/vim-styled-components', { 'branch': 'main' }

Plug 'posva/vim-vue'

" CSS
Plug 'hail2u/vim-css3-syntax'
Plug 'cakebaker/scss-syntax.vim'

call plug#end()

let g:LanguageClient_serverCommands = {
    \ 'reason': ['/absolute/path/to/reason-language-server.exe'],
    \ }

let g:ctrlp_custom_ignore = 'node_modules\|DS_Store\|git'

" Change mapleader
let mapleader=","

nnoremap <space>fs :update<CR>
nmap <space>sf <Plug>CtrlSFPrompt
nmap <space>ca :%s/
nmap <space>vv <Plug>CtrlSFCwordExec

" Close completion window
autocmd CompleteDone * pclose
" Use deoplete.
let g:deoplete#enable_at_startup = 1
call deoplete#custom#var('file', 'enable_buffer_path', v:true)

" deoplete tab-complete
inoremap <expr><tab> pumvisible() ? "\<c-n>" : "\<tab>"

set background=dark
colorscheme base16-eighties
let g:airline_powerline_fonts = 1
let g:airline_theme='base16'
set guifont=Source\ Code\ Pro\ for\ Powerline:h14

" Javscript Config
let g:jsx_ext_required = 0 " Allow JSX in normal JS files
let g:syntastic_javascript_checkers = ['eslint']

" Ale Linter
let g:ale_linters = {
\   'javascript': ['eslint'],
\}

let g:ale_fixers = {}
let g:ale_set_highlights = 0

let g:ale_fixers.javascript = [
\ 'eslint',
\]

let g:ale_fix_on_save = 0

let g:ale_lint_on_text_changed = 'never'
let g:ale_lint_on_enter = 0

" CSS Config
au BufRead,BufNewFile *.css set filetype=scss

nmap <Leader>a= :Tabularize /=<CR>
vmap <Leader>a= :Tabularize /=<CR>
nmap <Leader>a :Tabularize /:\zs<CR>
vmap <Leader>a :Tabularize /:\zs<CR>

"Rubocop
let g:syntastic_ruby_rubocop_exec = '/Users/dev/.rvm/rubies/ruby-2.2.2/bin/ruby /Users/dev/.rvm/gems/ruby-2.2.2@influitive/bin/rubocop'

"Use locally installed eslint
let local_eslint = finddir('node_modules', '.;') . '/.bin/eslint'
if matchstr(local_eslint, "^\/\\w") == ''
    let local_eslint = getcwd() . "/" . local_eslint
endif
if executable(local_eslint)
  let g:syntastic_javascript_eslint_exec = local_eslint
endif

" Word wrap without line breaks
set wrap
set linebreak
set nolist  " list disables linebreakset shell=bash
set textwidth=0
set wrapmargin=0

set ttimeoutlen=10

"Change vim shell to reduce lag from fish loading
set shell=/bin/bash\ -i

" Make Vim more useful
set nocompatible
" Use the OS clipboard by default (on versions compiled with `+clipboard`)
set clipboard=unnamed
" Enhance command-line completion
set wildmenu
" Allow backspace in insert mode
set backspace=indent,eol,start
" Optimize for fast terminal connections
set ttyfast
" Add the g flag to search/replace by default
set gdefault
" Use UTF-8 without BOM
set encoding=utf-8 nobomb
" Centralize backups, swapfiles and undo history
set backupdir=~/.vim/backups
set directory=~/.vim/swaps
if exists("&undodir")
  set undodir=~/.vim/undo
endif

" Don’t create backups when editing files in certain directories
set backupskip=/tmp/*,/private/tmp/*

" Respect modeline in files
set modeline
set modelines=4
" Enable per-directory .vimrc files and disable unsafe commands in them
set exrc
set secure
" Enable line numbers
set number
" Enable syntax highlighting
syntax on
" Highlight current line
set cursorline
" Make tabs as wide as two spaces
set shiftwidth=2
set tabstop=2
set expandtab
" Show “invisible” characters
set lcs=tab:▸\ ,trail:·,eol:¬,nbsp:_
set list
" Highlight searches
set hlsearch
" Ignore case of searches
set ignorecase
" Highlight dynamically as pattern is typed
set incsearch
" Always show status line
set laststatus=2
" Enable mouse in all modes
set mouse=a
" Disable error bells

set noerrorbells visualbell t_vb=
if has('autocmd')
  autocmd GUIEnter * set visualbell t_vb=
endif

" Don’t reset cursor to start of line when moving around.
set nostartofline
" Show the cursor position
set ruler
" Don’t show the intro message when starting Vim
set shortmess=atI
" Show the current mode
set showmode
" Show the filename in the window titlebar
set title
" Show the (partial) command as it’s being typed
set showcmd
" Use relative line numbers
if exists("&relativenumber")
  set relativenumber
  au BufReadPost * set relativenumber
endif
" Start scrolling three lines before the horizontal window border
set scrolloff=3
" remap control + enter to inserta new line between curlies
autocmd FileType javascript inoremap {<CR> {<CR>}<Esc><S-o>
nmap <tab> :b#<cr>

" indent when pasting
" nnoremap p p=`]
" nnoremap <c-p> p

" Strip trailing whitespace (,ss)
function! StripWhitespace()
  let save_cursor = getpos(".")
  let old_query = getreg('/')
  :%s/\s\+$//e
  call setpos('.', save_cursor)
  call setreg('/', old_query)
endfunction
noremap <leader>ss :call StripWhitespace()<CR>
" Save a file as root (,W)
noremap <leader>W :w !sudo tee % > /dev/null<CR>
vmap v <Plug>(expand_region_expand)
vmap <C-v> <Plug>(expand_region_shrink)
" Automatic commands
if has("autocmd")
  " Enable file type detection
  filetype on
  " Treat .json files as .js
  autocmd BufNewFile,BufRead *.json setfiletype json syntax=json
  " Treat .md files as Markdown
  autocmd BufNewFile,BufRead *.md setlocal filetype=markdown
endif
" Nerd Tree Settings
autocmd StdinReadPre * let s:std_in=1
autocmd VimEnter * if argc() == 0 && !exists("s:std_in") | NERDTree | endif
set hidden
map <C-n> :NERDTreeToggle<CR>
let NERDTreeShowHidden=1
let NERDTreeQuitOnOpen=0

autocmd bufenter * if (winnr("$") == 1 && exists("b:NERDTreeType") && b:NERDTreeType == "primary") | q | endif

" Make it easier to open and edit .vimrc
" source $MYVIMRC reloads the saved $MYVIMRC
:nmap <Leader>s :source $MYVIMRC<CR>
:nmap <Leader>v :e $MYVIMRC<CR>

" Make it easier to open bash dotfiles directory
:nmap <Leader>dot :e ~/.dotfiles<CR>

" fugitive git bindings
nnoremap <space>ga :Git add %:p<CR><CR>
nnoremap <space>gs :Gstatus<CR>
nnoremap <space>gc :Gcommit -v -q<CR>
nnoremap <space>gt :Gcommit -v -q %:p<CR>
nnoremap <space>gd :Gdiff<CR>
nnoremap <space>ge :Gedit<CR>
nnoremap <space>gr :Gread<CR>
nnoremap <space>gw :Gwrite<CR><CR>
nnoremap <space>gl :silent! Glog<CR>:bot copen<CR>
nnoremap <space>gp :Ggrep<Space>
nnoremap <space>gm :Gmove<Space>
nnoremap <space>gb :Git branch<Space>
nnoremap <space>go :Git checkout<Space>
nnoremap <space>gps :Dispatch! git push<CR>
nnoremap <space>gpl :Dispatch! git pull<CR>

let g:ycm_semantic_triggers =  {
  \   'c' : ['->', '.'],
  \   'objc' : ['->', '.', 're!\[[_a-zA-Z]+\w*\s', 're!^\s*[^\W\d]\w*\s',
  \             're!\[.*\]\s'],
  \   'ocaml' : ['.', '#'],
  \   'reason' : ['.', '#'],
  \   'cpp,objcpp' : ['->', '.', '::'],
  \   'perl' : ['->'],
  \   'php' : ['->', '::'],
  \   'cs,java,javascript,typescript,d,python,perl6,scala,vb,elixir,go' : ['.'],
  \   'ruby' : ['.', '::'],
  \   'lua' : ['.', ':'],
  \   'erlang' : [':'],
  \ }

" Syntax Checking with Syntastic
set statusline+=%#warningmsg#
set statusline+=%{SyntasticStatuslineFlag()}
set statusline+=%*
let syntastic_mode_map = { 'passive_filetypes': ['html'] }

let g:syntastic_html_tidy_ignore_errors = [
	\  '> proprietary attribute "',
	\  '> attribute "lang" lacks value',
	\  '> attribute "href" lacks value',
	\  'trimming empty <'
	\ ]

let g:syntastic_html_tidy_blocklevel_tags = [
  \ 'ng-include',
  \ 'ng-form'
  \ ]
let g:syntastic_always_populate_loc_list = 1
let g:syntastic_auto_loc_list            = 1
let g:syntastic_check_on_open            = 1
let g:syntastic_check_on_wq              = 0
