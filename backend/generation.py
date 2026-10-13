import os
import io
import replicate
from PIL import Image, ImageDraw

def generate_mock_texture(prompt: str, surface_type: str) -> Image.Image:
    """Generates a simple mock texture using Pillow for fast local frontend testing."""
    # Create a 512x512 image
    # Wall -> light blue, Floor -> light brown
    bg_color = (200, 220, 255) if surface_type == 'wall' else (210, 180, 140)
    img = Image.new('RGB', (512, 512), color=bg_color)
    draw = ImageDraw.Draw(img)
    
    # Draw a grid pattern to show it's a texture
    step = 64
    for x in range(0, 512, step):
        draw.line([(x, 0), (x, 512)], fill=(255, 255, 255), width=2)
    for y in range(0, 512, step):
        draw.line([(0, y), (512, y)], fill=(255, 255, 255), width=2)
        
    # Write the prompt text on it
    draw.text((20, 256), f"MOCK: {surface_type}", fill=(0, 0, 0))
    draw.text((20, 280), prompt[:40], fill=(0, 0, 0))
    
    return img

import urllib.parse
import requests

def generate_texture_api(prompt: str, surface_type: str, seed: int = 42, reference_image_bytes: bytes = None, sketch_image_bytes: bytes = None) -> Image.Image:
    """Calls a completely free API (pollinations.ai) for Stable Diffusion."""
    
    import re
    # Strip all architectural words that trick the AI into drawing a room
    safe_prompt = prompt.lower().replace("room", "").replace("living", "").replace("wall", "").replace("floor", "").strip()
    safe_prompt = re.sub(r'[^a-zA-Z0-9 ]', '', safe_prompt)
    
    # Keep it simple for the Flux model, long prompts cause 500 timeouts
    enhanced_prompt = f"seamless {safe_prompt} texture tileable flat material"
    
    # Pollinations currently has a bug where %20 (spaces) in the URL crash their flux model router. 
    # Replacing spaces with hyphens completely bypasses this bug while preserving the prompt.
    encoded_prompt = enhanced_prompt.replace(" ", "-")
    
    # Pollinations.ai recently broke their default model ("sana") causing 500 errors. 
    # Forcing model=turbo fixes it. It's also much faster and less likely to timeout than flux.
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?nologo=true&seed={seed}&model=turbo"
    
    print(f"Fetching from free API via GET: {url}")
    
    try:
        response = requests.get(url, verify=False, timeout=25)
        if response.status_code != 200:
            print(f"Free API failed with status {response.status_code}. Falling back to mock texture.")
            return generate_mock_texture(prompt, surface_type)
        return Image.open(io.BytesIO(response.content))
    except Exception as e:
        print(f"Free API error: {e}. Falling back to mock texture.")
        return generate_mock_texture(prompt, surface_type)

def generate_texture(prompt: str, surface_type: str, seed: int = 42, reference_image_bytes: bytes = None, sketch_image_bytes: bytes = None, use_mock: bool = True) -> Image.Image:
    if use_mock:
        print("Using MOCK texture generator...")
        return generate_mock_texture(prompt, surface_type)
    else:
        print("Using FREE API...")
        return generate_texture_api(prompt, surface_type, seed, reference_image_bytes, sketch_image_bytes)
