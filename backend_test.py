#!/usr/bin/env python3
"""
Speakking Voice Translation Coach - Backend API Testing
Tests all voice features: login, lesson sessions, voice endpoints, and AI chat
"""

import requests
import sys
import json
import base64
import time
from datetime import datetime

class SpeakkingAPITester:
    def __init__(self, base_url="https://voice-translate-hub-3.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.session_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                if files:
                    # Remove Content-Type for file uploads
                    headers.pop('Content-Type', None)
                    response = requests.post(url, files=files, headers=headers, timeout=30)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                try:
                    error_detail = response.json().get('detail', 'Unknown error')
                    details += f", Error: {error_detail}"
                except:
                    details += f", Response: {response.text[:100]}"

            self.log_test(name, success, details)
            
            if success:
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                return False, {}

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test basic health endpoints"""
        print("\n=== HEALTH CHECK ===")
        self.run_test("API Root", "GET", "", 200)
        self.run_test("Health Check", "GET", "health", 200)

    def test_admin_login(self):
        """Test admin login with credentials from test_credentials.md"""
        print("\n=== ADMIN LOGIN ===")
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@speakking.com", "password": "admin123"}
        )
        
        if success and 'token' in response:
            self.token = response['token']
            print(f"✅ Token obtained: {self.token[:20]}...")
            
            # Verify admin user details
            user = response.get('user', {})
            if user.get('is_admin'):
                self.log_test("Admin privileges verified", True)
            else:
                self.log_test("Admin privileges verified", False, "User is not admin")
            
            return True
        else:
            self.log_test("Token extraction", False, "No token in response")
            return False

    def test_scenarios(self):
        """Test scenario endpoints"""
        print("\n=== SCENARIOS ===")
        success, scenarios = self.run_test("Get Scenarios", "GET", "scenarios", 200)
        
        if success and scenarios:
            print(f"✅ Found {len(scenarios)} scenarios")
            
            # Test specific scenario
            if scenarios:
                scenario_id = scenarios[0]['id']
                self.run_test("Get Specific Scenario", "GET", f"scenarios/{scenario_id}", 200)
                return scenario_id
        
        return None

    def test_lesson_session(self, scenario_id):
        """Test lesson session creation"""
        print("\n=== LESSON SESSION ===")
        if not scenario_id:
            self.log_test("Start Lesson Session", False, "No scenario ID available")
            return None
            
        success, response = self.run_test(
            "Start Lesson Session",
            "POST",
            f"lessons/start?scenario_id={scenario_id}",
            200
        )
        
        if success and 'session' in response:
            self.session_id = response['session']['id']
            print(f"✅ Session started: {self.session_id}")
            
            # Verify session data
            session = response['session']
            scenario = response.get('scenario', {})
            
            if session.get('user_id') and session.get('scenario_id'):
                self.log_test("Session data validation", True)
            else:
                self.log_test("Session data validation", False, "Missing required session fields")
                
            return self.session_id
        else:
            self.log_test("Session ID extraction", False, "No session in response")
            return None

    def test_ai_chat(self):
        """Test AI chat functionality"""
        print("\n=== AI CHAT ===")
        if not self.session_id:
            self.log_test("AI Chat", False, "No session ID available")
            return False
            
        # Test initial greeting
        success, response = self.run_test(
            "AI Chat - Initial Message",
            "POST",
            "chat",
            200,
            data={"message": "Hello, I'm ready to practice!", "session_id": self.session_id}
        )
        
        if success and 'response' in response:
            ai_response = response['response']
            print(f"✅ AI Response: {ai_response[:100]}...")
            
            # Check if response contains Turkish sentence (key feature)
            if any(turkish_word in ai_response.lower() for turkish_word in ['merhaba', 'nasıl', 'ben', 'sen', 'günaydın']):
                self.log_test("AI includes Turkish sentence", True)
            else:
                # AI might give Turkish in different message, so we'll test with a follow-up
                success2, response2 = self.run_test(
                    "AI Chat - Request Turkish Sentence",
                    "POST",
                    "chat",
                    200,
                    data={"message": "Please give me a Turkish sentence to translate", "session_id": self.session_id}
                )
                
                if success2 and 'response' in response2:
                    ai_response2 = response2['response']
                    if any(turkish_word in ai_response2.lower() for turkish_word in ['merhaba', 'nasıl', 'ben', 'sen', 'günaydın', 'turkish']):
                        self.log_test("AI provides Turkish sentences", True)
                    else:
                        self.log_test("AI provides Turkish sentences", False, "No Turkish content detected")
            
            return True
        else:
            return False

    def test_voice_endpoints(self):
        """Test voice-related endpoints"""
        print("\n=== VOICE ENDPOINTS ===")
        
        # Test TTS endpoint
        success, response = self.run_test(
            "TTS Endpoint (/api/voice/speak)",
            "POST",
            "voice/speak?text=Hello%20world&voice=nova",
            200
        )
        
        if success and 'audio' in response:
            self.log_test("TTS returns audio data", True)
            
            # Verify audio format
            if response.get('format') == 'mp3':
                self.log_test("TTS audio format", True)
            else:
                self.log_test("TTS audio format", False, f"Expected mp3, got {response.get('format')}")
        else:
            self.log_test("TTS returns audio data", False, "No audio in response")

        # Test voice chat endpoint exists (without actual audio file)
        # We'll test with a mock base64 audio to see if endpoint exists
        mock_audio_b64 = base64.b64encode(b"mock audio data").decode('utf-8')
        
        if self.session_id:
            # This will likely fail due to invalid audio, but we're testing if endpoint exists
            response = requests.post(
                f"{self.base_url}/voice/chat",
                json={"session_id": self.session_id, "audio_base64": mock_audio_b64},
                headers={'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/json'},
                timeout=30
            )
            
            if response.status_code in [200, 400, 500]:  # Endpoint exists
                self.log_test("Voice chat endpoint exists", True, f"Status: {response.status_code}")
            else:
                self.log_test("Voice chat endpoint exists", False, f"Status: {response.status_code}")

    def test_lesson_history(self):
        """Test lesson history endpoint"""
        print("\n=== LESSON HISTORY ===")
        self.run_test("Get Lesson History", "GET", "lessons/history", 200)

    def test_student_progress_endpoints(self):
        """Test new student progress and badge endpoints"""
        print("\n=== STUDENT PROGRESS & BADGES ===")
        
        # Test student progress endpoint
        success, response = self.run_test("Get Student Progress", "GET", "student/progress", 200)
        
        if success:
            # Verify progress data structure
            required_fields = ['total_sessions', 'total_minutes', 'total_corrections', 'current_streak', 'weekly_stats', 'level']
            missing_fields = [field for field in required_fields if field not in response]
            
            if not missing_fields:
                self.log_test("Progress data structure", True)
            else:
                self.log_test("Progress data structure", False, f"Missing fields: {missing_fields}")
            
            # Check weekly stats format
            weekly_stats = response.get('weekly_stats', [])
            if isinstance(weekly_stats, list) and len(weekly_stats) == 7:
                self.log_test("Weekly stats format", True)
            else:
                self.log_test("Weekly stats format", False, f"Expected 7 days, got {len(weekly_stats) if isinstance(weekly_stats, list) else 'invalid'}")
        
        # Test student badges endpoint
        success, response = self.run_test("Get Student Badges", "GET", "student/badges", 200)
        
        if success:
            # Verify badges data structure
            required_fields = ['earned_count', 'total_count', 'badges']
            missing_fields = [field for field in required_fields if field not in response]
            
            if not missing_fields:
                self.log_test("Badges data structure", True)
            else:
                self.log_test("Badges data structure", False, f"Missing fields: {missing_fields}")
            
            # Check if badges have required properties
            badges = response.get('badges', [])
            if badges and isinstance(badges, list):
                first_badge = badges[0]
                badge_fields = ['id', 'name', 'description', 'icon', 'color', 'earned']
                missing_badge_fields = [field for field in badge_fields if field not in first_badge]
                
                if not missing_badge_fields:
                    self.log_test("Badge object structure", True)
                else:
                    self.log_test("Badge object structure", False, f"Missing badge fields: {missing_badge_fields}")
        
        # Test recent corrections endpoint
        success, response = self.run_test("Get Recent Corrections", "GET", "student/recent-corrections?limit=10", 200)
        
        if success:
            corrections = response if isinstance(response, list) else []
            self.log_test("Recent corrections endpoint", True, f"Returned {len(corrections)} corrections")
        else:
            self.log_test("Recent corrections endpoint", False)

    def test_hint_system(self):
        """Test new hint/translate endpoint for Adam Asmaca style hints"""
        print("\n=== HINT SYSTEM (NEW FEATURE) ===")
        
        # Test hint translation endpoint
        success, response = self.run_test(
            "Hint Translation Endpoint",
            "POST",
            "hint/translate",
            200,
            data={"turkish_sentence": "Merhaba, nasılsın?", "level": "A1"}
        )
        
        if success:
            # Verify hint response structure
            if 'translation' in response and 'success' in response:
                self.log_test("Hint response structure", True)
                
                if response.get('success') and response.get('translation'):
                    self.log_test("Hint translation success", True, f"Translation: {response['translation']}")
                else:
                    self.log_test("Hint translation success", False, "No translation provided")
            else:
                self.log_test("Hint response structure", False, "Missing required fields")
        
        # Test with different levels
        for level in ['A2', 'B1', 'C1']:
            success, response = self.run_test(
                f"Hint Translation - Level {level}",
                "POST",
                "hint/translate",
                200,
                data={"turkish_sentence": "Ben her sabah kahvaltı yaparım", "level": level}
            )
            
            if success and response.get('success'):
                self.log_test(f"Hint works for level {level}", True)
            else:
                self.log_test(f"Hint works for level {level}", False)

    def test_end_session(self):
        """Test ending the lesson session"""
        print("\n=== END SESSION ===")
        if not self.session_id:
            self.log_test("End Session", False, "No session ID available")
            return
            
        self.run_test(
            "End Lesson Session",
            "POST",
            f"lessons/{self.session_id}/end",
            200
        )

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Speakking Voice Translation Coach API Tests")
        print(f"📍 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Health check
        self.test_health_check()
        
        # Authentication
        if not self.test_admin_login():
            print("❌ Cannot proceed without authentication")
            return self.generate_report()
        
        # Core functionality
        scenario_id = self.test_scenarios()
        session_id = self.test_lesson_session(scenario_id)
        
        # AI and Voice features
        self.test_ai_chat()
        self.test_voice_endpoints()
        
        # Student Progress Features (NEW)
        self.test_student_progress_endpoints()
        
        # Hint System (NEW FEATURE)
        self.test_hint_system()
        
        # Cleanup
        self.test_lesson_history()
        self.test_end_session()
        
        return self.generate_report()

    def generate_report(self):
        """Generate final test report"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed < self.tests_run:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  • {result['test']}: {result['details']}")
        
        print("\n🎯 KEY FEATURES TESTED:")
        print("  • Admin login with test credentials")
        print("  • Lesson session creation and management")
        print("  • AI chat with Turkish translation coaching")
        print("  • TTS endpoint (/api/voice/speak)")
        print("  • Voice chat endpoint (/api/voice/chat)")
        print("  • Student progress tracking (NEW)")
        print("  • Badge system and achievements (NEW)")
        print("  • Recent corrections review (NEW)")
        print("  • Hint/translate system for Adam Asmaca style (NEW)")
        print("  • Session cleanup and history")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    tester = SpeakkingAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Test execution failed: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())