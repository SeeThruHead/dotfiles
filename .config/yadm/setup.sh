#!/bin/bash
# Fresh Mac setup — run this on a brand new machine
# curl -sL https://raw.githubusercontent.com/SeeThruHead/dotfiles/main/.config/yadm/setup.sh | bash
set -euo pipefail

echo "==> Installing Xcode CLI tools..."
xcode-select --install 2>/dev/null || true
echo "    Press enter once Xcode CLI tools are installed..."
read -r

echo "==> Installing Homebrew..."
if ! command -v brew &>/dev/null; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

echo "==> Installing yadm and gnupg..."
brew install yadm gnupg pinentry-mac

echo "==> Setting up GPG..."
mkdir -p ~/.gnupg
echo "pinentry-program $(brew --prefix)/bin/pinentry-mac" > ~/.gnupg/gpg-agent.conf

echo "==> Generating SSH key..."
if [ ! -f ~/.ssh/id_ed25519 ]; then
  ssh-keygen -t ed25519 -C "SeeThruHead" -f ~/.ssh/id_ed25519
  echo ""
  echo "    Add this key to GitHub → Settings → SSH Keys:"
  echo ""
  cat ~/.ssh/id_ed25519.pub
  echo ""
  echo "    Press enter once added..."
  read -r
fi

echo "==> Cloning dotfiles..."
yadm clone git@github.com:SeeThruHead/dotfiles.git --no-bootstrap

echo "==> Decrypting secrets (enter GPG passphrase)..."
yadm decrypt

echo "==> Running bootstrap..."
yadm bootstrap

echo "==> Done! Log out and back in for all settings to take effect."
