"""Which edition is installed. The Full edition ships h3/pro and js/pro; the Free one doesn't."""

try:
    from .pro import finish as PF, control as PC
    try:
        from .pro import krea as PK
    except Exception:
        PK = None
    PRO = True
except ImportError:
    PF = PC = PK = None
    PRO = False

EDITION = "full" if PRO else "free"
FULL_URL = "https://ko-fi.com/enzinoxl/"
FULL_PRICE = "$11.99"
FREE_MAX_LORAS = 3

try:
    from ._build import BUILD
except ImportError:
    BUILD = "dev"
