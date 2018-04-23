function mod
	jscodeshift -t js-codemod/transforms/no-vars.js $argv
jscodeshift -t js-codemod/transforms/require-import.js $argv
end
