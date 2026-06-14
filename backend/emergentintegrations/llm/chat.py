import google.generativeai as genai


class UserMessage:
    def __init__(self, text: str):
        self.text = text


class LlmChat:
    def __init__(self, api_key: str, session_id: str = "", system_message: str = ""):
        self.api_key = api_key
        self.session_id = session_id
        self.system_message = system_message
        self._model = None
        self._model_name = None

    def with_model(self, provider: str, model_name: str):
        self._model_name = model_name
        genai.configure(api_key=self.api_key)
        self._model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=self.system_message,
        )
        return self

    async def send_message(self, user_message: UserMessage) -> str:
        if not self._model:
            raise RuntimeError("Model not configured. Call with_model() first.")
        response = self._model.generate_content(user_message.text)
        return response.text
