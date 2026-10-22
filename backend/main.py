try:
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass

from fastapi import FastAPI, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import uvicorn
import os
import base64
from io import BytesIO

# Load .env file manually so we don't need extra dependencies
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if line.strip() and not line.startswith("#") and "=" in line:
                key, val = line.strip().split("=", 1)
                os.environ[key] = val.strip()

from generation import generate_texture

app = FastAPI(title="Parametric 3D Interior API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Determine if we should run in mock mode
# Set USE_MOCK=False in your environment when you have REPLICATE_API_TOKEN set
USE_MOCK = os.environ.get("USE_MOCK", "True").lower() in ("true", "1", "yes")

@app.post("/generate-texture")
async def api_generate_texture(
    prompt: str = Form(...),
    surface_type: str = Form(...),
    seed: int = Form(42),
    reference_image: Optional[UploadFile] = File(None),
    sketch_image: Optional[UploadFile] = File(None)
):
    try:
        ref_img_bytes = await reference_image.read() if reference_image else None
        sketch_img_bytes = await sketch_image.read() if sketch_image else None
        
        image = generate_texture(
            prompt=prompt,
            surface_type=surface_type,
            seed=seed,
            reference_image_bytes=ref_img_bytes,
            sketch_image_bytes=sketch_img_bytes,
            use_mock=USE_MOCK
        )
        
        buffered = BytesIO()
        image.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        return JSONResponse(content={"texture": f"data:image/jpeg;base64,{img_str}"})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

def extract_cv_blueprint(img_bytes: bytes) -> dict:
    """Fast, deterministic Computer Vision fallback parser that analyzes ceiling architecture."""
    import numpy as np
    from PIL import Image
    import io

    img = Image.open(io.BytesIO(img_bytes))
    w, h = img.size
    ceil_h = int(h * 0.35)
    ceil_crop = np.array(img.crop((0, 0, w, ceil_h)))
    r, g, b = ceil_crop[:, :, 0], ceil_crop[:, :, 1], ceil_crop[:, :, 2]
    total_px = w * ceil_h

    warm_cove = (r > 175) & (g > 130) & (b < 160) & (r - b > 25)
    cyan_cove = (b > 140) & (g > 130) & (b > r + 15)
    blue_paint = (r > 90) & (r < 180) & (g > 120) & (g < 210) & (b > 140) & (b > r + 10)
    wood = (r > 120) & (r < 205) & (g > 65) & (g < 145) & (b < 95) & (r > g + 25)
    bright_spot = (r > 225) & (g > 225) & (b > 210)

    cyan_ratio = float(np.sum(cyan_cove) / total_px)
    blue_ratio = float(np.sum(blue_paint) / total_px)
    cove_ratio = float(np.sum(warm_cove) / total_px)
    wood_ratio = float(np.sum(wood) / total_px)

    warm_r = int(np.mean(r[warm_cove])) if np.sum(warm_cove) > 50 else 255
    warm_g = int(np.mean(g[warm_cove])) if np.sum(warm_cove) > 50 else 213
    warm_b = int(np.mean(b[warm_cove])) if np.sum(warm_cove) > 50 else 79
    cove_hex = f'#{warm_r:02x}{warm_g:02x}{warm_b:02x}'

    cyan_r = int(np.mean(r[cyan_cove])) if np.sum(cyan_cove) > 50 else 0
    cyan_g = int(np.mean(g[cyan_cove])) if np.sum(cyan_cove) > 50 else 229
    cyan_b = int(np.mean(b[cyan_cove])) if np.sum(cyan_cove) > 50 else 255
    inner_cove_hex = f'#{cyan_r:02x}{cyan_g:02x}{cyan_b:02x}'

    tray_r = int(np.mean(r[blue_paint])) if np.sum(blue_paint) > 50 else 245
    tray_g = int(np.mean(g[blue_paint])) if np.sum(blue_paint) > 50 else 245
    tray_b = int(np.mean(b[blue_paint])) if np.sum(blue_paint) > 50 else 245
    tray_hex = f'#{tray_r:02x}{tray_g:02x}{tray_b:02x}'

    if cyan_ratio > 0.03 or (blue_ratio > 0.04 and cove_ratio > 0.02):
        shape = 'circular_ring'
        fixture = 'ceiling_fan'
        desc = 'Modern circular ring false ceiling medallion with dual warm gold and cyan cove LEDs, sky-blue painted tray, and 3-blade ceiling fan.'
        has_slats = True
        inner_cove = inner_cove_hex
    elif wood_ratio > 0.12:
        shape = 'wooden_slats'
        fixture = 'linear_led'
        desc = 'Modern linear acoustic wooden slats ceiling with warm embedded LED light channels.'
        has_slats = True
        inner_cove = None
    elif cove_ratio > 0.03:
        shape = 'modern_tray'
        fixture = 'chandelier'
        desc = 'Architectural modern dropped perimeter tray with warm cove LED glow and multi-pendant cluster chandelier.'
        has_slats = False
        inner_cove = None
    else:
        shape = 'modern_tray'
        fixture = 'chandelier'
        desc = 'Modern false ceiling tray with ambient lighting.'
        has_slats = False
        inner_cove = None

    return {
        'primaryShape': shape,
        'outerCoveColor': cove_hex,
        'hasInnerCoveLight': bool(inner_cove is not None),
        'innerCoveColor': inner_cove,
        'ceilingTrayPaintColor': tray_hex,
        'hasAccentRafterBeams': bool(has_slats),
        'rafterBeamCount': 3 if has_slats else 0,
        'hasSpotlights': bool(np.sum(bright_spot) > 20),
        'fixture': fixture,
        'fanBlades': 3,
        'description': desc
    }

@app.post("/analyze-ceiling-blueprint")
async def api_analyze_ceiling_blueprint(
    image: UploadFile = File(...),
    gemini_api_key: Optional[str] = Form(None)
):
    """
    AI Vision Blueprint Engine:
    Decomposes arbitrary ceiling photos into structured 3D architectural JSON blueprints.
    Uses Google Gemini 2.5 Flash Vision when key is provided, with instant Computer Vision fallback.
    """
    try:
        import json
        import io
        from PIL import Image

        img_bytes = await image.read()
        key = gemini_api_key or os.environ.get("GEMINI_API_KEY")
        
        blueprint = None
        source = "computer_vision"
        
        # 1. Attempt Gemini 2.5 Flash Vision if key is available
        if key:
            try:
                from google import genai
                from google.genai import types
                
                client = genai.Client(api_key=key)
                img_pil = Image.open(io.BytesIO(img_bytes))
                w, h = img_pil.size
                ceil_crop = img_pil.crop((0, 0, w, int(h * 0.45)))
                
                prompt = (
                    "You are an architectural 3D CAD modeling expert. Analyze the false ceiling in this interior room photo.\n"
                    "Extract its 3D architectural blueprint specification as a JSON object matching this schema:\n"
                    "{\n"
                    '  "primaryShape": "circular_ring" | "rectangular_tray" | "wooden_slats" | "coffered_grid" | "floating_island" | "minimal_spots" | "flat",\n'
                    '  "outerCoveColor": "#hex",\n'
                    '  "hasInnerCoveLight": boolean,\n'
                    '  "innerCoveColor": "#hex" or null,\n'
                    '  "ceilingTrayPaintColor": "#hex",\n'
                    '  "hasAccentRafterBeams": boolean,\n'
                    '  "rafterBeamCount": integer,\n'
                    '  "hasSpotlights": boolean,\n'
                    '  "fixture": "ceiling_fan" | "chandelier" | "linear_led" | "spots_only",\n'
                    '  "fanBlades": integer,\n'
                    '  "description": "brief architectural description"\n'
                    "}"
                )
                
                response = client.models.generate_content(
                    model="gemini-3.8-flash",
                    contents=[ceil_crop, prompt],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json"
                    )
                )
                if response and response.text:
                    blueprint = json.loads(response.text)
                    source = "gemini-3.8-flash"
                    if blueprint:
                        shape = blueprint.get("primaryShape", "")
                        if shape in ["rectangular_tray", "tray", "tray_cove", "modern_tray"]:
                            blueprint["primaryShape"] = "modern_tray"
                        elif shape in ["circular", "circle", "round", "circular_ring"]:
                            blueprint["primaryShape"] = "circular_ring"
                        elif shape in ["slats", "wood_slats", "wooden_slats"]:
                            blueprint["primaryShape"] = "wooden_slats"
                        elif shape in ["coffered", "grid", "coffered_grid"]:
                            blueprint["primaryShape"] = "coffered_grid"
                        elif shape in ["island", "floating", "floating_island"]:
                            blueprint["primaryShape"] = "floating_island"
                        elif shape in ["spots", "spotlights", "minimal_spots"]:
                            blueprint["primaryShape"] = "minimal_spots"
            except Exception as gemini_err:
                print("Gemini Vision API error (smooth fallback to Computer Vision):", gemini_err)
                blueprint = None
        
        # 2. Smooth, deterministic Computer Vision Fallback
        if not blueprint:
            blueprint = extract_cv_blueprint(img_bytes)
            source = "computer_vision"
            
        return JSONResponse(content={
            "status": "success",
            "source": source,
            "blueprint": blueprint
        })
    except Exception as err:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(err)})

if __name__ == "__main__":
    print(f"Starting server... Mock Mode: {USE_MOCK}")
    uvicorn.run(app, host="0.0.0.0", port=8000)
