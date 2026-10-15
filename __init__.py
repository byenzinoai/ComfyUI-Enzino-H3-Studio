"""
✦ Enzino H3 Studio — MiniMax H3 in one node for ComfyUI.
Text · Image · First + Last · End frame · References → video with native stereo sound.
by Enzino · https://enzinoai.com
"""

import logging

from .h3.node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .h3.routes import register_routes, VERSION

register_routes()
logging.info(f"[Enzino H3 Studio] v{VERSION} loaded")

WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
