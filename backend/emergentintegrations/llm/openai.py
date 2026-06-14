from typing import BinaryIO
from dataclasses import dataclass
from openai import OpenAI


@dataclass
class TranscriptionResult:
    text: str


class OpenAISpeechToText:
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)

    async def transcribe(
        self,
        file: BinaryIO,
        model: str = "whisper-1",
        response_format: str = "json",
        language: str = "en",
    ) -> TranscriptionResult:
        result = self.client.audio.transcriptions.create(
            model=model,
            file=file,
            response_format=response_format,
            language=language,
        )
        return TranscriptionResult(text=result["text"] if isinstance(result, dict) else result.text)


class OpenAITextToSpeech:
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)

    async def generate_speech(
        self,
        text: str,
        model: str = "tts-1",
        voice: str = "nova",
        speed: float = 1.0,
        response_format: str = "mp3",
    ) -> bytes:
        result = self.client.audio.speech.create(
            model=model,
            voice=voice,
            input=text,
            speed=speed,
            response_format=response_format,
        )
        return result.content
