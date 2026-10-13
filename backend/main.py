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

if __name__ == "__main__":
    print(f"Starting server... Mock Mode: {USE_MOCK}")
    uvicorn.run(app, host="0.0.0.0", port=8000)
