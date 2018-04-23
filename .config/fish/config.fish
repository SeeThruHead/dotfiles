# Path to Oh My Fish install.
set -gx OMF_PATH /Users/dev/.local/share/omf
set -g Z_SCRIPT_PATH  (brew --prefix)/etc/profile.d/z.sh
# Customize Oh My Fish configuration path.
#set -gx OMF_CONFIG /Users/dev/.config/omf

# Load oh-my-fish configuration.
source $OMF_PATH/init.fish

source $OMF_PATH/plugins/rvm/rvm
rvm default
eval (hub alias -s)
