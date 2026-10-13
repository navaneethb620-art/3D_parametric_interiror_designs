import requests
import urllib3

urllib3.disable_warnings()
payload = {
    "prompt": "seamless white oak wood material texture, macro photography, flat lay, flat lighting, tileable, repeating pattern, uniform",
    "negative_prompt": "architecture, room, interior, furniture, corner, perspective, vanishing point, depth, 3d render, shadows, gradient, lighting",
    "nologo": True,
    "seed": 999
}
res = requests.post("https://image.pollinations.ai/", json=payload, verify=False)
with open("test_texture.jpg", "wb") as f:
    f.write(res.content)
print("Saved as test_texture.jpg")
