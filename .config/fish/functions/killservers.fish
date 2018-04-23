# Defined in - @ line 2
function killservers
	kill (lsof -t -i :7000)
end
