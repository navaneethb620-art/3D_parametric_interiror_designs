import requests
import urllib3
import urllib.parse

urllib3.disable_warnings()
prompt = "seamless white oak wood material texture macro photography flat lay flat lighting tileable repeating pattern uniform"
url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?nologo=true&seed=42"
print("URL:", url)
res = requests.get(url, verify=False)
with open("test_texture2.jpg", "wb") as f:
    f.write(res.content)
print("Saved as test_texture2.jpg")
