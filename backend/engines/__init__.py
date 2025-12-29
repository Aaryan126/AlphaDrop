"""Background removal engines."""
from .base import BaseEngine, EngineResult
from .color_based import ColorBasedEngine
from .ai_matting import AIMattingEngine
from .ai_segmentation import AISegmentationEngine

# Engine registry for factory pattern
ENGINE_REGISTRY: dict[str, type[BaseEngine]] = {
    "color": ColorBasedEngine,
    "matting": AIMattingEngine,
    "segmentation": AISegmentationEngine,
}


def get_engine(method: str) -> BaseEngine:
    """
    Factory function to get engine instance by method name.

    Args:
        method: Engine method name (color, matting, segmentation)

    Returns:
        Engine instance

    Raises:
        ValueError: If method is not recognized
    """
    if method not in ENGINE_REGISTRY:
        raise ValueError(f"Unknown engine method: {method}. Available: {list(ENGINE_REGISTRY.keys())}")

    return ENGINE_REGISTRY[method]()
