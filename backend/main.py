"""
AlphaDrop Backend - FastAPI server for background removal.
"""
import logging
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Literal

from .config import settings
from .utils import load_image, encode_png_base64
from .engines import get_engine, ENGINE_REGISTRY
from .analyzer import select_method

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="AlphaDrop API",
    description="Background removal API with multiple engines",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RemoveBackgroundResponse(BaseModel):
    """Response model for background removal endpoint."""

    success: bool
    method_used: str
    confidence: float
    image: str  # Base64-encoded PNG
    analysis: dict | None = None  # Optional analysis details for auto mode


class HealthResponse(BaseModel):
    """Response model for health check."""

    status: str
    version: str
    engines: list[str]


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        engines=list(ENGINE_REGISTRY.keys()),
    )


@app.post("/v1/remove-background", response_model=RemoveBackgroundResponse)
async def remove_background(
    image: UploadFile = File(..., description="Image file to process"),
    method: Literal["auto", "matting", "segmentation", "color"] = Form(
        default="auto", description="Background removal method"
    ),
):
    """
    Remove background from an image.

    Methods:
    - auto: Automatically select best method based on image analysis
    - matting: AI-based matting (best for portraits)
    - segmentation: AI-based segmentation (best for objects)
    - color: Color-based heuristic (best for logos/icons with uniform backgrounds)
    """
    # Validate content type
    if image.content_type not in settings.supported_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image format: {image.content_type}. "
            f"Supported: {settings.supported_formats}",
        )

    # Read image bytes
    try:
        file_bytes = await image.read()
    except Exception as e:
        logger.error(f"Failed to read image: {e}")
        raise HTTPException(status_code=400, detail="Failed to read image file")

    # Check file size
    if len(file_bytes) > settings.max_image_size:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Maximum size: {settings.max_image_size // (1024*1024)}MB",
        )

    # Load image
    try:
        rgb_image = load_image(file_bytes)
    except Exception as e:
        logger.error(f"Failed to decode image: {e}")
        raise HTTPException(status_code=400, detail="Failed to decode image")

    logger.info(f"Processing image: {image.filename}, shape: {rgb_image.shape}, method: {method}")

    analysis_result = None

    # Handle auto-selection
    if method == "auto":
        try:
            analysis = select_method(rgb_image)
            method = analysis.recommended_method
            analysis_result = {
                "has_face": analysis.has_face,
                "color_entropy": round(analysis.color_entropy, 2),
                "edge_density": round(analysis.edge_density, 4),
                "auto_selected": method,
            }
            logger.info(f"Auto-selected method: {method}, analysis: {analysis_result}")
        except Exception as e:
            logger.warning(f"Auto-selection failed: {e}, falling back to segmentation")
            method = "segmentation"

    # Get engine and process
    try:
        engine = get_engine(method)
        result = engine.process(rgb_image)
    except Exception as e:
        logger.error(f"Engine {method} failed: {e}")

        # Fallback chain: try segmentation, then color
        fallback_methods = ["segmentation", "color"]
        for fallback in fallback_methods:
            if fallback != method:
                try:
                    logger.info(f"Trying fallback: {fallback}")
                    engine = get_engine(fallback)
                    result = engine.process(rgb_image)
                    result.confidence *= 0.8  # Reduce confidence for fallback
                    break
                except Exception as fallback_error:
                    logger.error(f"Fallback {fallback} also failed: {fallback_error}")
        else:
            raise HTTPException(
                status_code=500,
                detail="All background removal methods failed",
            )

    # Encode result
    try:
        image_base64 = encode_png_base64(result.rgba_image)
    except Exception as e:
        logger.error(f"Failed to encode result: {e}")
        raise HTTPException(status_code=500, detail="Failed to encode result image")

    logger.info(f"Successfully processed with {result.method}, confidence: {result.confidence:.2f}")

    return RemoveBackgroundResponse(
        success=True,
        method_used=result.method,
        confidence=result.confidence,
        image=image_base64,
        analysis=analysis_result,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled errors."""
    logger.exception(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"success": False, "detail": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
