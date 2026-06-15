import requests

url = "https://api.cartesia.ai/tts/bytes"
headers = {
    "Authorization": "Bearer sk_car_rnTaKhDMpvj3UYLd8szTPB",
    "Cartesia-Version": "2024-06-10",
    "Content-Type": "application/json"
}
payload = {
    "model_id": "sonic-3.5",
    "transcript": "Hello, how are you?",
    "voice": {
        "mode": "id",
        "id": "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"
    },
    "output_format": {
        "container": "mp3",
        "bit_rate": 64000,
        "sample_rate": 44100
    }
}
r = requests.post(url, headers=headers, json=payload)
print(r.status_code)
print(r.text[:200])
