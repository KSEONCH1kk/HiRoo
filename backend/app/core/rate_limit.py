from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

LIMIT_AUTH = "5/minute"
LIMIT_API = "60/minute"
LIMIT_WS_MSG = "10/second"
