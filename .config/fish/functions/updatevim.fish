function updatevim
	set -lx SHELL bash
vim +BundleInstall! +BundleClean +qall
end
