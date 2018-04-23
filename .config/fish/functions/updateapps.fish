function updateapps
	for app in waldo api challenge-suggester community narci-service hub
        set_color purple
        echo ------ updating $app -------
        cd ~/Code/infl/$app
        git pull
        bundle
        rake db:migrate
        set_color green
        echo ------ $app updated ------
    end
    echo ------ apps updated ------
    set_color normal
end
