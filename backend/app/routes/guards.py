"""Route dependencies shared by the routers."""
from app import settings
from app.errors import ApiError


def require_demo_mode() -> None:
    """Demo-only routes (reset, simulator, scenarios) do not exist when DEMO_MODE is off."""
    if not settings.demo_mode():
        raise ApiError(404, "not_found", "Not Found")
