function diffbranch
	git log $argv[1]..$argv[2] --pretty=oneline
end
