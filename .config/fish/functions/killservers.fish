function killservers
	ps aux | grep -E "([r]uby|[s]pring|[s]idekiq|[g]ulp|[d]evServer)" | perl -lane "print \$F[1]" | xargs kill -9;
  docker stop (docker ps -aq)
end
