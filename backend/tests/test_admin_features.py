#!/usr/bin/env python3
"""
Speakking Admin Features - Backend API Tests
Tests: Sentence Bank, Documents, AI Config, Curriculum Management
"""

import pytest
import requests
import os
import uuid
import tempfile

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://voice-translate-hub-3.preview.emergentagent.com"

API_URL = f"{BASE_URL}/api"

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@speakking.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30
    )
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code}")
    
    data = response.json()
    assert "token" in data, "No token in login response"
    assert data.get("user", {}).get("is_admin") == True, "User is not admin"
    return data["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth token"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


# ==================== HEALTH CHECK ====================
class TestHealthCheck:
    """Basic API health check tests"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{API_URL}/", timeout=10)
        assert response.status_code == 200
        print(f"API Root: {response.json()}")
    
    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = requests.get(f"{API_URL}/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"


# ==================== SENTENCE BANK TESTS ====================
class TestSentenceBank:
    """Tests for Sentence Bank CRUD operations"""
    
    created_sentence_ids = []
    
    def test_get_sentences_empty_or_list(self, admin_headers):
        """Test GET /api/admin/sentences - List all sentences"""
        response = requests.get(f"{API_URL}/admin/sentences", headers=admin_headers, timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} existing sentences")
    
    def test_create_sentence(self, admin_headers):
        """Test POST /api/admin/sentences - Create a new sentence"""
        test_sentence = {
            "turkish": f"TEST_Merhaba, nasilsin? {uuid.uuid4().hex[:6]}",
            "english": "Hello, how are you?",
            "level": "A1",
            "topic": "Greetings"
        }
        
        response = requests.post(
            f"{API_URL}/admin/sentences",
            json=test_sentence,
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "No ID in response"
        assert data["turkish"] == test_sentence["turkish"]
        assert data["english"] == test_sentence["english"]
        assert data["level"] == test_sentence["level"]
        assert data["topic"] == test_sentence["topic"]
        
        # Store for cleanup
        self.__class__.created_sentence_ids.append(data["id"])
        print(f"Created sentence: {data['id']}")
    
    def test_get_sentences_by_level(self, admin_headers):
        """Test GET /api/admin/sentences?level=A1 - Filter by level"""
        response = requests.get(
            f"{API_URL}/admin/sentences?level=A1",
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # All returned sentences should be A1 level
        for sentence in data:
            assert sentence.get("level") == "A1", f"Expected A1, got {sentence.get('level')}"
        
        print(f"Found {len(data)} A1 level sentences")
    
    def test_update_sentence(self, admin_headers):
        """Test PUT /api/admin/sentences/{id} - Update a sentence"""
        # First create a sentence to update
        test_sentence = {
            "turkish": f"TEST_Gunaydin {uuid.uuid4().hex[:6]}",
            "english": "Good morning",
            "level": "A1",
            "topic": "Greetings"
        }
        
        create_response = requests.post(
            f"{API_URL}/admin/sentences",
            json=test_sentence,
            headers=admin_headers,
            timeout=10
        )
        assert create_response.status_code == 200
        sentence_id = create_response.json()["id"]
        self.__class__.created_sentence_ids.append(sentence_id)
        
        # Update the sentence
        update_data = {
            "english": "Good morning, friend!",
            "level": "A2"
        }
        
        update_response = requests.put(
            f"{API_URL}/admin/sentences/{sentence_id}",
            json=update_data,
            headers=admin_headers,
            timeout=10
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        # Verify update by fetching all sentences and finding ours
        get_response = requests.get(f"{API_URL}/admin/sentences", headers=admin_headers, timeout=10)
        sentences = get_response.json()
        updated_sentence = next((s for s in sentences if s["id"] == sentence_id), None)
        
        assert updated_sentence is not None, "Updated sentence not found"
        assert updated_sentence["english"] == "Good morning, friend!"
        assert updated_sentence["level"] == "A2"
        print(f"Updated sentence {sentence_id}")
    
    def test_bulk_create_sentences(self, admin_headers):
        """Test POST /api/admin/sentences/bulk - Bulk create sentences"""
        bulk_sentences = {
            "sentences": [
                {"turkish": f"TEST_Tesekkur ederim {uuid.uuid4().hex[:6]}", "english": "Thank you", "level": "A1", "topic": "Politeness"},
                {"turkish": f"TEST_Rica ederim {uuid.uuid4().hex[:6]}", "english": "You're welcome", "level": "A1", "topic": "Politeness"},
                {"turkish": f"TEST_Lutfen {uuid.uuid4().hex[:6]}", "english": "Please", "level": "A1", "topic": "Politeness"}
            ]
        }
        
        response = requests.post(
            f"{API_URL}/admin/sentences/bulk",
            json=bulk_sentences,
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 200, f"Bulk create failed: {response.text}"
        
        data = response.json()
        assert "count" in data
        assert data["count"] == 3
        print(f"Bulk created {data['count']} sentences")
    
    def test_delete_sentence(self, admin_headers):
        """Test DELETE /api/admin/sentences/{id} - Delete a sentence"""
        # Create a sentence to delete
        test_sentence = {
            "turkish": f"TEST_Silmek icin {uuid.uuid4().hex[:6]}",
            "english": "For deletion",
            "level": "A1",
            "topic": "Test"
        }
        
        create_response = requests.post(
            f"{API_URL}/admin/sentences",
            json=test_sentence,
            headers=admin_headers,
            timeout=10
        )
        assert create_response.status_code == 200
        sentence_id = create_response.json()["id"]
        
        # Delete the sentence
        delete_response = requests.delete(
            f"{API_URL}/admin/sentences/{sentence_id}",
            headers=admin_headers,
            timeout=10
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{API_URL}/admin/sentences", headers=admin_headers, timeout=10)
        sentences = get_response.json()
        deleted_sentence = next((s for s in sentences if s["id"] == sentence_id), None)
        assert deleted_sentence is None, "Sentence was not deleted"
        print(f"Deleted sentence {sentence_id}")
    
    def test_delete_nonexistent_sentence(self, admin_headers):
        """Test DELETE /api/admin/sentences/{id} - Delete non-existent sentence returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{API_URL}/admin/sentences/{fake_id}",
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 404


# ==================== DOCUMENT TESTS ====================
class TestDocuments:
    """Tests for Document upload and management"""
    
    created_doc_ids = []
    
    def test_list_documents(self, admin_headers):
        """Test GET /api/admin/documents - List all documents"""
        response = requests.get(f"{API_URL}/admin/documents", headers=admin_headers, timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} existing documents")
    
    def test_upload_txt_document(self, admin_headers):
        """Test POST /api/admin/documents/upload - Upload a TXT file"""
        # Create a test TXT file
        test_content = """TEST DOCUMENT
This is a test document for Speakking AI training.
It contains sample English text that can be used for context.
Turkish: Merhaba
English: Hello
"""
        
        # Remove Content-Type for multipart upload
        headers = {"Authorization": admin_headers["Authorization"]}
        
        files = {
            "file": (f"test_doc_{uuid.uuid4().hex[:6]}.txt", test_content.encode(), "text/plain")
        }
        
        response = requests.post(
            f"{API_URL}/admin/documents/upload",
            files=files,
            headers=headers,
            timeout=30
        )
        assert response.status_code == 200, f"Upload failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "filename" in data
        assert "text_content" in data
        assert data["content_type"] == "text/plain"
        
        self.__class__.created_doc_ids.append(data["id"])
        print(f"Uploaded document: {data['id']} - {data['filename']}")
    
    def test_get_document_content(self, admin_headers):
        """Test GET /api/admin/documents/{id}/content - Get document content"""
        # First upload a document
        test_content = "TEST content for preview"
        headers = {"Authorization": admin_headers["Authorization"]}
        files = {"file": (f"preview_test_{uuid.uuid4().hex[:6]}.txt", test_content.encode(), "text/plain")}
        
        upload_response = requests.post(
            f"{API_URL}/admin/documents/upload",
            files=files,
            headers=headers,
            timeout=30
        )
        assert upload_response.status_code == 200
        doc_id = upload_response.json()["id"]
        self.__class__.created_doc_ids.append(doc_id)
        
        # Get document content
        content_response = requests.get(
            f"{API_URL}/admin/documents/{doc_id}/content",
            headers=admin_headers,
            timeout=10
        )
        assert content_response.status_code == 200
        
        data = content_response.json()
        assert "text_content" in data
        assert "TEST content for preview" in data["text_content"]
        print(f"Document content retrieved: {data['text_content'][:50]}...")
    
    def test_delete_document(self, admin_headers):
        """Test DELETE /api/admin/documents/{id} - Delete a document"""
        # Upload a document to delete
        test_content = "Document to be deleted"
        headers = {"Authorization": admin_headers["Authorization"]}
        files = {"file": (f"delete_test_{uuid.uuid4().hex[:6]}.txt", test_content.encode(), "text/plain")}
        
        upload_response = requests.post(
            f"{API_URL}/admin/documents/upload",
            files=files,
            headers=headers,
            timeout=30
        )
        assert upload_response.status_code == 200
        doc_id = upload_response.json()["id"]
        
        # Delete the document
        delete_response = requests.delete(
            f"{API_URL}/admin/documents/{doc_id}",
            headers=admin_headers,
            timeout=10
        )
        assert delete_response.status_code == 200
        
        # Verify deletion
        list_response = requests.get(f"{API_URL}/admin/documents", headers=admin_headers, timeout=10)
        docs = list_response.json()
        deleted_doc = next((d for d in docs if d["id"] == doc_id), None)
        assert deleted_doc is None, "Document was not deleted"
        print(f"Deleted document {doc_id}")
    
    def test_upload_unsupported_file_type(self, admin_headers):
        """Test upload of unsupported file type returns 400"""
        headers = {"Authorization": admin_headers["Authorization"]}
        files = {"file": ("test.exe", b"fake executable", "application/octet-stream")}
        
        response = requests.post(
            f"{API_URL}/admin/documents/upload",
            files=files,
            headers=headers,
            timeout=30
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"


# ==================== AI CONFIG TESTS ====================
class TestAIConfig:
    """Tests for AI Configuration management"""
    
    original_config = None
    
    def test_get_ai_config(self, admin_headers):
        """Test GET /api/admin/ai-config - Get current AI config"""
        response = requests.get(f"{API_URL}/admin/ai-config", headers=admin_headers, timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert "id" in data
        assert "use_sentence_bank" in data
        assert "use_documents" in data
        assert "max_sentences_per_lesson" in data
        
        # Store original config for restoration
        self.__class__.original_config = data
        print(f"AI Config: use_sentence_bank={data['use_sentence_bank']}, use_documents={data['use_documents']}, max_sentences={data['max_sentences_per_lesson']}")
    
    def test_update_ai_config_system_prompt(self, admin_headers):
        """Test PUT /api/admin/ai-config - Update system prompt"""
        update_data = {
            "system_prompt": "TEST: Always be encouraging and patient with students."
        }
        
        response = requests.put(
            f"{API_URL}/admin/ai-config",
            json=update_data,
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 200
        
        # Verify update
        get_response = requests.get(f"{API_URL}/admin/ai-config", headers=admin_headers, timeout=10)
        config = get_response.json()
        assert config["system_prompt"] == update_data["system_prompt"]
        print("System prompt updated successfully")
    
    def test_toggle_sentence_bank(self, admin_headers):
        """Test toggling sentence bank on/off"""
        # Get current state
        get_response = requests.get(f"{API_URL}/admin/ai-config", headers=admin_headers, timeout=10)
        current_state = get_response.json()["use_sentence_bank"]
        
        # Toggle
        update_data = {"use_sentence_bank": not current_state}
        response = requests.put(
            f"{API_URL}/admin/ai-config",
            json=update_data,
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 200
        
        # Verify toggle
        verify_response = requests.get(f"{API_URL}/admin/ai-config", headers=admin_headers, timeout=10)
        new_state = verify_response.json()["use_sentence_bank"]
        assert new_state == (not current_state), "Sentence bank toggle failed"
        
        # Toggle back
        requests.put(f"{API_URL}/admin/ai-config", json={"use_sentence_bank": current_state}, headers=admin_headers, timeout=10)
        print(f"Sentence bank toggled: {current_state} -> {new_state} -> {current_state}")
    
    def test_toggle_documents(self, admin_headers):
        """Test toggling documents on/off"""
        # Get current state
        get_response = requests.get(f"{API_URL}/admin/ai-config", headers=admin_headers, timeout=10)
        current_state = get_response.json()["use_documents"]
        
        # Toggle
        update_data = {"use_documents": not current_state}
        response = requests.put(
            f"{API_URL}/admin/ai-config",
            json=update_data,
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 200
        
        # Verify toggle
        verify_response = requests.get(f"{API_URL}/admin/ai-config", headers=admin_headers, timeout=10)
        new_state = verify_response.json()["use_documents"]
        assert new_state == (not current_state), "Documents toggle failed"
        
        # Toggle back
        requests.put(f"{API_URL}/admin/ai-config", json={"use_documents": current_state}, headers=admin_headers, timeout=10)
        print(f"Documents toggled: {current_state} -> {new_state} -> {current_state}")
    
    def test_update_max_sentences(self, admin_headers):
        """Test updating max sentences per lesson"""
        update_data = {"max_sentences_per_lesson": 15}
        
        response = requests.put(
            f"{API_URL}/admin/ai-config",
            json=update_data,
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 200
        
        # Verify update
        get_response = requests.get(f"{API_URL}/admin/ai-config", headers=admin_headers, timeout=10)
        config = get_response.json()
        assert config["max_sentences_per_lesson"] == 15
        print("Max sentences per lesson updated to 15")
    
    def test_restore_original_config(self, admin_headers):
        """Restore original AI config after tests"""
        if self.__class__.original_config:
            restore_data = {
                "system_prompt": self.__class__.original_config.get("system_prompt", ""),
                "use_sentence_bank": self.__class__.original_config.get("use_sentence_bank", True),
                "use_documents": self.__class__.original_config.get("use_documents", True),
                "max_sentences_per_lesson": self.__class__.original_config.get("max_sentences_per_lesson", 10)
            }
            response = requests.put(
                f"{API_URL}/admin/ai-config",
                json=restore_data,
                headers=admin_headers,
                timeout=10
            )
            assert response.status_code == 200
            print("Original AI config restored")


# ==================== ADMIN SETTINGS TESTS ====================
class TestAdminSettings:
    """Tests for Admin Settings (daily limit, teacher tone, speech speed)"""
    
    def test_get_admin_settings(self, admin_headers):
        """Test GET /api/admin/settings"""
        response = requests.get(f"{API_URL}/admin/settings", headers=admin_headers, timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert "daily_limit_minutes" in data
        assert "teacher_tone" in data
        assert "speech_speed" in data
        print(f"Settings: daily_limit={data['daily_limit_minutes']}, tone={data['teacher_tone']}, speed={data['speech_speed']}")
    
    def test_update_daily_limit(self, admin_headers):
        """Test updating daily limit"""
        update_data = {"daily_limit_minutes": 45}
        
        response = requests.put(
            f"{API_URL}/admin/settings",
            json=update_data,
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 200
        
        # Verify
        get_response = requests.get(f"{API_URL}/admin/settings", headers=admin_headers, timeout=10)
        assert get_response.json()["daily_limit_minutes"] == 45
        
        # Restore
        requests.put(f"{API_URL}/admin/settings", json={"daily_limit_minutes": 30}, headers=admin_headers, timeout=10)
        print("Daily limit updated and restored")
    
    def test_update_teacher_tone(self, admin_headers):
        """Test updating teacher tone"""
        for tone in ["friendly", "formal", "encouraging"]:
            response = requests.put(
                f"{API_URL}/admin/settings",
                json={"teacher_tone": tone},
                headers=admin_headers,
                timeout=10
            )
            assert response.status_code == 200
            
            get_response = requests.get(f"{API_URL}/admin/settings", headers=admin_headers, timeout=10)
            assert get_response.json()["teacher_tone"] == tone
        
        # Restore to friendly
        requests.put(f"{API_URL}/admin/settings", json={"teacher_tone": "friendly"}, headers=admin_headers, timeout=10)
        print("Teacher tone tested for all values")
    
    def test_update_speech_speed(self, admin_headers):
        """Test updating speech speed"""
        for speed in ["slow", "normal", "fast"]:
            response = requests.put(
                f"{API_URL}/admin/settings",
                json={"speech_speed": speed},
                headers=admin_headers,
                timeout=10
            )
            assert response.status_code == 200
            
            get_response = requests.get(f"{API_URL}/admin/settings", headers=admin_headers, timeout=10)
            assert get_response.json()["speech_speed"] == speed
        
        # Restore to normal
        requests.put(f"{API_URL}/admin/settings", json={"speech_speed": "normal"}, headers=admin_headers, timeout=10)
        print("Speech speed tested for all values")


# ==================== ADMIN USERS TESTS ====================
class TestAdminUsers:
    """Tests for Admin Users listing"""
    
    def test_list_users(self, admin_headers):
        """Test GET /api/admin/users - List all users"""
        response = requests.get(f"{API_URL}/admin/users", headers=admin_headers, timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should have at least admin user"
        
        # Verify user structure (no password exposed)
        for user in data:
            assert "id" in user
            assert "email" in user
            assert "name" in user
            assert "password" not in user, "Password should not be exposed"
        
        print(f"Found {len(data)} users")


# ==================== CURRICULUM TESTS ====================
class TestCurriculum:
    """Tests for Curriculum/Scenario management"""
    
    created_scenario_ids = []
    
    def test_list_scenarios(self, admin_headers):
        """Test GET /api/scenarios - List all scenarios"""
        response = requests.get(f"{API_URL}/scenarios", headers=admin_headers, timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} scenarios")
    
    def test_list_scenarios_by_level(self, admin_headers):
        """Test GET /api/scenarios?level=A1 - Filter by level"""
        response = requests.get(f"{API_URL}/scenarios?level=A1", headers=admin_headers, timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        for scenario in data:
            assert scenario["level"] == "A1"
        print(f"Found {len(data)} A1 scenarios")
    
    def test_create_scenario(self, admin_headers):
        """Test POST /api/scenarios - Create new topic"""
        test_scenario = {
            "level": "A1",
            "title": f"TEST_Topic_{uuid.uuid4().hex[:6]}",
            "title_tr": "Test Konusu",
            "description": "Test topic for automated testing",
            "description_tr": "Otomatik test icin test konusu",
            "topics": ["test", "automation"]
        }
        
        response = requests.post(
            f"{API_URL}/scenarios",
            json=test_scenario,
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["title"] == test_scenario["title"]
        
        self.__class__.created_scenario_ids.append(data["id"])
        print(f"Created scenario: {data['id']}")
    
    def test_delete_scenario(self, admin_headers):
        """Test DELETE /api/scenarios/{id} - Delete a topic"""
        # Create a scenario to delete
        test_scenario = {
            "level": "A1",
            "title": f"TEST_Delete_{uuid.uuid4().hex[:6]}",
            "title_tr": "Silinecek Konu",
            "description": "To be deleted",
            "description_tr": "Silinecek"
        }
        
        create_response = requests.post(
            f"{API_URL}/scenarios",
            json=test_scenario,
            headers=admin_headers,
            timeout=10
        )
        assert create_response.status_code == 200
        scenario_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(
            f"{API_URL}/scenarios/{scenario_id}",
            headers=admin_headers,
            timeout=10
        )
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = requests.get(f"{API_URL}/scenarios/{scenario_id}", headers=admin_headers, timeout=10)
        assert get_response.status_code == 404
        print(f"Deleted scenario {scenario_id}")


# ==================== CLEANUP ====================
@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_headers):
    """Cleanup test data after all tests"""
    yield
    
    # Cleanup sentences with TEST_ prefix
    try:
        response = requests.get(f"{API_URL}/admin/sentences", headers=admin_headers, timeout=10)
        if response.status_code == 200:
            sentences = response.json()
            for s in sentences:
                if s.get("turkish", "").startswith("TEST_"):
                    requests.delete(f"{API_URL}/admin/sentences/{s['id']}", headers=admin_headers, timeout=10)
                    print(f"Cleaned up sentence: {s['id']}")
    except Exception as e:
        print(f"Sentence cleanup error: {e}")
    
    # Cleanup documents with test_ prefix
    try:
        response = requests.get(f"{API_URL}/admin/documents", headers=admin_headers, timeout=10)
        if response.status_code == 200:
            docs = response.json()
            for d in docs:
                if d.get("filename", "").startswith("test_") or d.get("filename", "").startswith("preview_test_") or d.get("filename", "").startswith("delete_test_"):
                    requests.delete(f"{API_URL}/admin/documents/{d['id']}", headers=admin_headers, timeout=10)
                    print(f"Cleaned up document: {d['id']}")
    except Exception as e:
        print(f"Document cleanup error: {e}")
    
    # Cleanup scenarios with TEST_ prefix
    try:
        response = requests.get(f"{API_URL}/scenarios", headers=admin_headers, timeout=10)
        if response.status_code == 200:
            scenarios = response.json()
            for s in scenarios:
                if s.get("title", "").startswith("TEST_"):
                    requests.delete(f"{API_URL}/scenarios/{s['id']}", headers=admin_headers, timeout=10)
                    print(f"Cleaned up scenario: {s['id']}")
    except Exception as e:
        print(f"Scenario cleanup error: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
