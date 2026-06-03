bind = "127.0.0.1:8000"
workers = 3
threads = 2
timeout = 60
accesslog = "-"
errorlog = "-"
loglevel = "info"
wsgi_app = "wsgi:app"
