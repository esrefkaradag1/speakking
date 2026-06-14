import torch
import io
import torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

print("Testing loading model...")
try:
    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"
    print("Device:", device)
    
    # Let's load the model
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)
    print("Model loaded successfully!")
    
    # Try generating a simple test sentence
    text = "Merhaba, ben Speaky! Bugün nasılsın?"
    print("Generating voice...")
    wav = model.generate(text, language_id="tr")
    
    # Convert to bytes
    buffer = io.BytesIO()
    torchaudio.save(buffer, wav.cpu(), sample_rate=model.sr, format="wav")
    audio_bytes = buffer.getvalue()
    print("Success! Generated audio bytes length:", len(audio_bytes))
except Exception as e:
    print("Error during Chatterbox generation:", e)
