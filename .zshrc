export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

. /usr/local/etc/profile.d/z.sh

alias gapi="go install ./cmd/advocate-api && advocate-api"
alias dc="docker-compose"
alias gs="git status"
alias ga="git add --all"

export PATH=$PATH:~/go/bin

# Python 3.14
export PATH="/usr/local/opt/python@3.14/libexec/bin:$PATH"

# bun completions
[ -s "/Users/shanekeulen/.bun/_bun" ] && source "/Users/shanekeulen/.bun/_bun"


# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Added by CodeRabbit CLI installer
export PATH="/Users/shanekeulen/.local/bin:$PATH"
