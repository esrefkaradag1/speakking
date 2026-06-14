import asyncio
import edge_tts

async def main():
    text = "Harika! Doğru cevap. Şimdi bunu İngilizceye çevir: I go to school every day."
    communicate = edge_tts.Communicate(text, "en-US-AvaMultilingualNeural")
    await communicate.save("test_ava.mp3")
    
    communicate2 = edge_tts.Communicate(text, "tr-TR-EmelNeural")
    await communicate2.save("test_emel.mp3")

if __name__ == "__main__":
    asyncio.run(main())
