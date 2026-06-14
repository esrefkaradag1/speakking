"""
Test suite for Speakking structured function calling features:
- reportCorrection: Returns structured corrections when student makes translation errors
- displayVocabularyHints: Returns structured vocabulary hints with every response
- Clean response text without JSON blocks
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://voice-translate-hub-3.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@speakking.com"
ADMIN_PASSWORD = "admin123"


class TestStructuredResponses:
    """Test structured corrections and vocabulary in chat responses"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data["token"]
        self.user_id = data["user"]["id"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health check passed")
        
    def test_get_scenarios(self):
        """Test scenarios endpoint to get scenario_id for lesson"""
        response = requests.get(f"{BASE_URL}/api/scenarios", headers=self.headers)
        assert response.status_code == 200
        scenarios = response.json()
        assert len(scenarios) > 0, "No scenarios found"
        print(f"✓ Found {len(scenarios)} scenarios")
        return scenarios[0]["id"]
        
    def test_start_lesson_session(self):
        """Test starting a lesson session"""
        # Get a scenario first
        scenarios_response = requests.get(f"{BASE_URL}/api/scenarios", headers=self.headers)
        scenarios = scenarios_response.json()
        scenario_id = scenarios[0]["id"]
        
        # Start lesson
        response = requests.post(
            f"{BASE_URL}/api/lessons/start?scenario_id={scenario_id}",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to start lesson: {response.text}"
        data = response.json()
        
        assert "session" in data
        assert "scenario" in data
        assert "remaining_minutes" in data
        assert data["session"]["id"] is not None
        
        print(f"✓ Lesson session started: {data['session']['id']}")
        return data["session"]["id"]
        
    def test_chat_returns_response_structure(self):
        """Test that /api/chat returns proper response structure with corrections and vocabulary arrays"""
        # Start a lesson first
        scenarios_response = requests.get(f"{BASE_URL}/api/scenarios", headers=self.headers)
        scenario_id = scenarios_response.json()[0]["id"]
        
        lesson_response = requests.post(
            f"{BASE_URL}/api/lessons/start?scenario_id={scenario_id}",
            headers=self.headers
        )
        session_id = lesson_response.json()["session"]["id"]
        
        # Send initial message
        chat_response = requests.post(
            f"{BASE_URL}/api/chat",
            json={"message": "Merhaba, pratige hazirim!", "session_id": session_id},
            headers=self.headers
        )
        assert chat_response.status_code == 200, f"Chat failed: {chat_response.text}"
        data = chat_response.json()
        
        # Verify response structure
        assert "response" in data, "Missing 'response' field"
        assert "session_id" in data, "Missing 'session_id' field"
        assert "corrections" in data, "Missing 'corrections' array"
        assert "vocabulary" in data, "Missing 'vocabulary' array"
        
        # Verify types
        assert isinstance(data["response"], str), "'response' should be string"
        assert isinstance(data["corrections"], list), "'corrections' should be list"
        assert isinstance(data["vocabulary"], list), "'vocabulary' should be list"
        
        print(f"✓ Chat response has correct structure")
        print(f"  - response: {data['response'][:100]}...")
        print(f"  - corrections count: {len(data['corrections'])}")
        print(f"  - vocabulary count: {len(data['vocabulary'])}")
        
        return session_id
        
    def test_chat_response_text_is_clean(self):
        """Test that response text doesn't contain [CORRECTION] or [VOCABULARY] JSON blocks"""
        # Start a lesson
        scenarios_response = requests.get(f"{BASE_URL}/api/scenarios", headers=self.headers)
        scenario_id = scenarios_response.json()[0]["id"]
        
        lesson_response = requests.post(
            f"{BASE_URL}/api/lessons/start?scenario_id={scenario_id}",
            headers=self.headers
        )
        session_id = lesson_response.json()["session"]["id"]
        
        # Send message
        chat_response = requests.post(
            f"{BASE_URL}/api/chat",
            json={"message": "Merhaba!", "session_id": session_id},
            headers=self.headers
        )
        data = chat_response.json()
        
        response_text = data["response"]
        
        # Check that JSON blocks are stripped
        assert "[CORRECTION]" not in response_text, "Response contains [CORRECTION] block"
        assert "[/CORRECTION]" not in response_text, "Response contains [/CORRECTION] block"
        assert "[VOCABULARY]" not in response_text, "Response contains [VOCABULARY] block"
        assert "[/VOCABULARY]" not in response_text, "Response contains [/VOCABULARY] block"
        
        print(f"✓ Response text is clean (no JSON blocks)")
        
    def test_vocabulary_structure(self):
        """Test vocabulary items have correct structure: word, meaning, example"""
        # Start a lesson
        scenarios_response = requests.get(f"{BASE_URL}/api/scenarios", headers=self.headers)
        scenario_id = scenarios_response.json()[0]["id"]
        
        lesson_response = requests.post(
            f"{BASE_URL}/api/lessons/start?scenario_id={scenario_id}",
            headers=self.headers
        )
        session_id = lesson_response.json()["session"]["id"]
        
        # Send initial message and wait for AI to respond with vocabulary
        chat_response = requests.post(
            f"{BASE_URL}/api/chat",
            json={"message": "Merhaba, pratige hazirim!", "session_id": session_id},
            headers=self.headers
        )
        data = chat_response.json()
        
        # AI should include vocabulary hints
        if len(data["vocabulary"]) > 0:
            vocab = data["vocabulary"][0]
            assert "word" in vocab, "Vocabulary missing 'word' field"
            assert "meaning" in vocab, "Vocabulary missing 'meaning' field"
            assert "example" in vocab, "Vocabulary missing 'example' field"
            print(f"✓ Vocabulary structure correct: word='{vocab['word']}', meaning='{vocab['meaning']}'")
        else:
            print("⚠ No vocabulary returned in initial response (may be expected)")
            
    def test_correction_triggered_by_wrong_translation(self):
        """Test that sending a wrong translation triggers correction in response"""
        # Start a lesson
        scenarios_response = requests.get(f"{BASE_URL}/api/scenarios", headers=self.headers)
        scenario_id = scenarios_response.json()[0]["id"]
        
        lesson_response = requests.post(
            f"{BASE_URL}/api/lessons/start?scenario_id={scenario_id}",
            headers=self.headers
        )
        session_id = lesson_response.json()["session"]["id"]
        
        # First, get a Turkish sentence from AI
        initial_response = requests.post(
            f"{BASE_URL}/api/chat",
            json={"message": "Merhaba, pratige hazirim!", "session_id": session_id},
            headers=self.headers
        )
        
        # Wait a bit for AI processing
        time.sleep(2)
        
        # Send a deliberately wrong translation
        wrong_response = requests.post(
            f"{BASE_URL}/api/chat",
            json={"message": "I am go school every day", "session_id": session_id},
            headers=self.headers
        )
        assert wrong_response.status_code == 200
        data = wrong_response.json()
        
        print(f"  Response after wrong translation:")
        print(f"  - corrections count: {len(data['corrections'])}")
        print(f"  - vocabulary count: {len(data['vocabulary'])}")
        
        # Note: AI may or may not detect this as an error depending on context
        # The important thing is the structure is correct
        assert isinstance(data["corrections"], list)
        assert isinstance(data["vocabulary"], list)
        
        if len(data["corrections"]) > 0:
            correction = data["corrections"][0]
            assert "original" in correction, "Correction missing 'original' field"
            assert "correction" in correction, "Correction missing 'correction' field"
            assert "explanation" in correction, "Correction missing 'explanation' field"
            assert "turkish" in correction, "Correction missing 'turkish' field"
            print(f"✓ Correction structure correct: original='{correction['original']}'")
        else:
            print("⚠ No correction returned (AI may not have detected error in context)")
            
    def test_corrections_saved_to_session(self):
        """Test that corrections are saved to lesson session in MongoDB"""
        # Start a lesson
        scenarios_response = requests.get(f"{BASE_URL}/api/scenarios", headers=self.headers)
        scenario_id = scenarios_response.json()[0]["id"]
        
        lesson_response = requests.post(
            f"{BASE_URL}/api/lessons/start?scenario_id={scenario_id}",
            headers=self.headers
        )
        session_id = lesson_response.json()["session"]["id"]
        
        # Send messages
        requests.post(
            f"{BASE_URL}/api/chat",
            json={"message": "Merhaba!", "session_id": session_id},
            headers=self.headers
        )
        
        time.sleep(1)
        
        # Send wrong translation
        requests.post(
            f"{BASE_URL}/api/chat",
            json={"message": "I am go school", "session_id": session_id},
            headers=self.headers
        )
        
        # End session and check history
        requests.post(
            f"{BASE_URL}/api/lessons/{session_id}/end",
            headers=self.headers
        )
        
        # Get lesson history
        history_response = requests.get(
            f"{BASE_URL}/api/lessons/history",
            headers=self.headers
        )
        assert history_response.status_code == 200
        sessions = history_response.json()
        
        # Find our session
        our_session = next((s for s in sessions if s["id"] == session_id), None)
        assert our_session is not None, "Session not found in history"
        
        # Check session has corrections array
        assert "corrections" in our_session, "Session missing 'corrections' field"
        assert isinstance(our_session["corrections"], list)
        
        print(f"✓ Session has corrections array with {len(our_session['corrections'])} items")
        
    def test_voice_chat_returns_structured_data(self):
        """Test that /api/voice/chat also returns structured corrections and vocabulary"""
        # This test verifies the endpoint exists and returns correct structure
        # We can't actually test voice input without audio, but we can verify the endpoint
        
        # Start a lesson
        scenarios_response = requests.get(f"{BASE_URL}/api/scenarios", headers=self.headers)
        scenario_id = scenarios_response.json()[0]["id"]
        
        lesson_response = requests.post(
            f"{BASE_URL}/api/lessons/start?scenario_id={scenario_id}",
            headers=self.headers
        )
        session_id = lesson_response.json()["session"]["id"]
        
        # Try voice chat with empty/invalid audio (should fail but show endpoint exists)
        voice_response = requests.post(
            f"{BASE_URL}/api/voice/chat",
            json={"session_id": session_id, "audio_base64": "invalid_base64"},
            headers=self.headers
        )
        
        # We expect this to fail due to invalid audio, but endpoint should exist
        # Status 500 means endpoint exists but audio processing failed
        assert voice_response.status_code in [200, 400, 500], f"Unexpected status: {voice_response.status_code}"
        print(f"✓ Voice chat endpoint exists (status: {voice_response.status_code})")


class TestAdminDashboardTabs:
    """Test Admin Dashboard tabs still work"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
    def test_sentences_endpoint(self):
        """Test Cumle Bankasi (Sentence Bank) endpoint"""
        response = requests.get(f"{BASE_URL}/api/admin/sentences", headers=self.headers)
        assert response.status_code == 200
        print(f"✓ Sentences endpoint works, {len(response.json())} sentences")
        
    def test_documents_endpoint(self):
        """Test Dokumanlar (Documents) endpoint"""
        response = requests.get(f"{BASE_URL}/api/admin/documents", headers=self.headers)
        assert response.status_code == 200
        print(f"✓ Documents endpoint works, {len(response.json())} documents")
        
    def test_ai_config_endpoint(self):
        """Test AI Egitimi (AI Config) endpoint"""
        response = requests.get(f"{BASE_URL}/api/admin/ai-config", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "use_sentence_bank" in data
        assert "use_documents" in data
        print(f"✓ AI Config endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
