set -x PGHOST "10.0.2.2"
set -x DISCOURSE_RELATIVE_URL_ROOT "/forum"
set -x DISCOURSE_DB_USERNAME postgres
set -x DISCOURSE_DB_PASSWORD mysecretpassword
set -x PLUGINATOR_REDIS_URL redis://10.0.2.2/9
set -x GPG_TTY (tty)
status --is-interactive; and source (rbenv init -|psub)
