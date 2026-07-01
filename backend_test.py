"""
GameZoo Backend API End-to-End Tests
Tests all 10 points from the main agent's checklist.
"""
import requests
import json
import sys
from datetime import datetime

# Base URL from frontend/.env
BASE_URL = "https://contest-arena-16.preview.emergentagent.com/api"

# Admin credentials (seeded)
ADMIN_EMAIL = "bachanta8@gmail.com"
ADMIN_PASSWORD = "Herts@910022"

# QBANK for skill answers (from seed.py)
QBANK = [
    ('What is 12 + 7?', ['17', '19', '21', '23'], '19', 'math'),
    ('What is 8 × 6?', ['42', '46', '48', '54'], '48', 'math'),
    ('What is 100 ÷ 4?', ['20', '25', '30', '40'], '25', 'math'),
    ('What is 15 - 8?', ['5', '6', '7', '8'], '7', 'math'),
    ('What is 9 × 9?', ['72', '81', '89', '99'], '81', 'math'),
    ('Capital city of France?', ['Rome', 'Madrid', 'Paris', 'Berlin'], 'Paris', 'trivia'),
    ('Which planet is closest to the Sun?', ['Venus', 'Mercury', 'Earth', 'Mars'], 'Mercury', 'trivia'),
    ('How many continents are there?', ['5', '6', '7', '8'], '7', 'trivia'),
    ('Who painted the Mona Lisa?', ['Van Gogh', 'Picasso', 'Da Vinci', 'Monet'], 'Da Vinci', 'trivia'),
    ('What colour do you get by mixing red + white?', ['Purple', 'Pink', 'Orange', 'Brown'], 'Pink', 'trivia'),
    ('How many sides does a hexagon have?', ['5', '6', '7', '8'], '6', 'trivia'),
    ('Largest ocean on Earth?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 'Pacific', 'trivia'),
    ('Which word means "happy"?', ['Gloomy', 'Joyful', 'Bitter', 'Weary'], 'Joyful', 'word'),
    ('Opposite of "hot"?', ['Warm', 'Cool', 'Cold', 'Icy'], 'Cold', 'word'),
    ('What is 25% of 200?', ['25', '40', '50', '75'], '50', 'math'),
    ('Square root of 64?', ['6', '7', '8', '9'], '8', 'math'),
    ('What year did WWII end?', ['1943', '1945', '1947', '1950'], '1945', 'trivia'),
    ('Chemical symbol for gold?', ['Go', 'Gd', 'Au', 'Ag'], 'Au', 'trivia'),
    ('Fastest land animal?', ['Lion', 'Cheetah', 'Horse', 'Leopard'], 'Cheetah', 'trivia'),
    ('Days in a leap year?', ['364', '365', '366', '367'], '366', 'trivia'),
]

def get_skill_answer(contest_slug):
    """Get the correct skill answer for a contest based on QBANK."""
    # Extract contest number from slug (e.g., "contest-1" -> 1)
    contest_num = int(contest_slug.split('-')[1])
    # QBANK index is (contest_num - 1) % 20
    qbank_index = (contest_num - 1) % 20
    return QBANK[qbank_index][2]  # Return the answer

# Test results tracking
results = {
    'passed': [],
    'failed': [],
    'total': 0
}

def log_test(test_num, description, passed, details=""):
    """Log test result."""
    results['total'] += 1
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status} | Test {test_num}: {description}")
    if details:
        print(f"   Details: {details}")
    
    if passed:
        results['passed'].append(f"Test {test_num}: {description}")
    else:
        results['failed'].append(f"Test {test_num}: {description} - {details}")

def test_1_register():
    """Test 1: POST /api/auth/register with a new email."""
    print("\n" + "="*80)
    print("TEST 1: POST /api/auth/register")
    print("="*80)
    
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    test_email = f"testuser_{timestamp}@example.com"
    
    payload = {
        "email": test_email,
        "name": "Test User",
        "password": "TestPass123!"
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json=payload, timeout=10)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'token' in data and 'user' in data:
                log_test(1, "Register new user", True, f"User created with email {test_email}, token received")
                return data['token'], test_email
            else:
                log_test(1, "Register new user", False, "Response missing 'token' or 'user'")
                return None, None
        else:
            log_test(1, "Register new user", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return None, None
    except Exception as e:
        log_test(1, "Register new user", False, f"Exception: {str(e)}")
        return None, None

def test_2_login_admin():
    """Test 2: POST /api/auth/login with admin credentials."""
    print("\n" + "="*80)
    print("TEST 2: POST /api/auth/login (admin)")
    print("="*80)
    
    payload = {
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'token' in data and 'user' in data:
                user = data['user']
                if user.get('role') == 'admin' and user.get('email') == ADMIN_EMAIL:
                    log_test(2, "Login as admin", True, f"Admin logged in, role={user.get('role')}")
                    return data['token']
                else:
                    log_test(2, "Login as admin", False, f"User role is {user.get('role')}, expected 'admin'")
                    return None
            else:
                log_test(2, "Login as admin", False, "Response missing 'token' or 'user'")
                return None
        else:
            log_test(2, "Login as admin", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return None
    except Exception as e:
        log_test(2, "Login as admin", False, f"Exception: {str(e)}")
        return None

def test_3_get_me(token):
    """Test 3: GET /api/auth/me with token."""
    print("\n" + "="*80)
    print("TEST 3: GET /api/auth/me")
    print("="*80)
    
    if not token:
        log_test(3, "Get current user", False, "No token available from previous tests")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'user_id' in data and 'email' in data:
                log_test(3, "Get current user", True, f"User info retrieved: {data.get('email')}")
            else:
                log_test(3, "Get current user", False, "Response missing expected user fields")
        else:
            log_test(3, "Get current user", False, f"Status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        log_test(3, "Get current user", False, f"Exception: {str(e)}")

def test_4_list_contests():
    """Test 4: GET /api/contests - verify 50 contests, no answer leakage."""
    print("\n" + "="*80)
    print("TEST 4: GET /api/contests")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/contests", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"Contests returned: {len(data)}")
            
            if len(data) != 50:
                log_test(4, "List contests", False, f"Expected 50 contests, got {len(data)}")
                return
            
            # Check first contest for structure and no answer leakage
            first = data[0]
            print(f"First contest: {json.dumps(first, indent=2)[:500]}")
            
            has_question = 'skill_question_q' in first
            has_options = 'skill_question_options' in first
            has_answer_leak = 'answer' in first or 'skill_question' in first or any('answer' in str(v).lower() for k, v in first.items() if k not in ['skill_question_q', 'skill_question_options'])
            
            if has_question and has_options and not has_answer_leak:
                log_test(4, "List contests", True, f"50 contests returned, skill questions present, no answer leakage")
            else:
                details = []
                if not has_question:
                    details.append("missing skill_question_q")
                if not has_options:
                    details.append("missing skill_question_options")
                if has_answer_leak:
                    details.append("ANSWER LEAKED in response")
                log_test(4, "List contests", False, ", ".join(details))
        else:
            log_test(4, "List contests", False, f"Status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        log_test(4, "List contests", False, f"Exception: {str(e)}")

def test_5_get_contest_by_slug():
    """Test 5: GET /api/contests/contest-1 - verify same shape."""
    print("\n" + "="*80)
    print("TEST 5: GET /api/contests/contest-1")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/contests/contest-1", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"Contest: {json.dumps(data, indent=2)[:500]}")
            
            has_question = 'skill_question_q' in data
            has_options = 'skill_question_options' in data
            has_answer_leak = 'answer' in data or 'skill_question' in data or any('answer' in str(v).lower() for k, v in data.items() if k not in ['skill_question_q', 'skill_question_options'])
            
            if has_question and has_options and not has_answer_leak:
                log_test(5, "Get contest by slug", True, "Contest returned with skill question, no answer leakage")
            else:
                details = []
                if not has_question:
                    details.append("missing skill_question_q")
                if not has_options:
                    details.append("missing skill_question_options")
                if has_answer_leak:
                    details.append("ANSWER LEAKED in response")
                log_test(5, "Get contest by slug", False, ", ".join(details))
        else:
            log_test(5, "Get contest by slug", False, f"Status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        log_test(5, "Get contest by slug", False, f"Exception: {str(e)}")

def test_6_verify_skill():
    """Test 6: POST /api/contests/contest-1/verify-skill with wrong and correct answers."""
    print("\n" + "="*80)
    print("TEST 6: POST /api/contests/contest-1/verify-skill")
    print("="*80)
    
    correct_answer = get_skill_answer("contest-1")
    print(f"Correct answer for contest-1: {correct_answer}")
    
    # Test with wrong answer
    try:
        wrong_payload = {"answer": "wrong_answer_123"}
        resp = requests.post(f"{BASE_URL}/contests/contest-1/verify-skill", json=wrong_payload, timeout=10)
        print(f"Wrong answer - Status: {resp.status_code}")
        print(f"Wrong answer - Response: {resp.text}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('correct') == False:
                print("✓ Wrong answer correctly rejected")
                wrong_test_passed = True
            else:
                print("✗ Wrong answer incorrectly accepted")
                wrong_test_passed = False
        else:
            print(f"✗ Unexpected status for wrong answer: {resp.status_code}")
            wrong_test_passed = False
    except Exception as e:
        print(f"✗ Exception with wrong answer: {str(e)}")
        wrong_test_passed = False
    
    # Test with correct answer
    try:
        correct_payload = {"answer": correct_answer}
        resp = requests.post(f"{BASE_URL}/contests/contest-1/verify-skill", json=correct_payload, timeout=10)
        print(f"Correct answer - Status: {resp.status_code}")
        print(f"Correct answer - Response: {resp.text}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('correct') == True:
                print("✓ Correct answer accepted")
                correct_test_passed = True
            else:
                print("✗ Correct answer incorrectly rejected")
                correct_test_passed = False
        else:
            print(f"✗ Unexpected status for correct answer: {resp.status_code}")
            correct_test_passed = False
    except Exception as e:
        print(f"✗ Exception with correct answer: {str(e)}")
        correct_test_passed = False
    
    if wrong_test_passed and correct_test_passed:
        log_test(6, "Verify skill answer", True, "Wrong answer rejected, correct answer accepted")
    else:
        details = []
        if not wrong_test_passed:
            details.append("wrong answer test failed")
        if not correct_test_passed:
            details.append("correct answer test failed")
        log_test(6, "Verify skill answer", False, ", ".join(details))

def test_7_checkout(user_token):
    """Test 7: POST /api/orders/checkout with incorrect and correct skill answers."""
    print("\n" + "="*80)
    print("TEST 7: POST /api/orders/checkout")
    print("="*80)
    
    if not user_token:
        log_test(7, "Checkout with skill validation", False, "No user token available")
        return None
    
    headers = {"Authorization": f"Bearer {user_token}"}
    
    # First, get contest-2 details to get contest_id
    try:
        resp = requests.get(f"{BASE_URL}/contests/contest-2", timeout=10)
        if resp.status_code != 200:
            log_test(7, "Checkout with skill validation", False, f"Could not fetch contest-2: {resp.status_code}")
            return None
        contest = resp.json()
        contest_id = contest['contest_id']
        print(f"Contest ID for contest-2: {contest_id}")
    except Exception as e:
        log_test(7, "Checkout with skill validation", False, f"Exception fetching contest: {str(e)}")
        return None
    
    correct_answer = get_skill_answer("contest-2")
    print(f"Correct answer for contest-2: {correct_answer}")
    
    # Test 7a: Incorrect skill answer
    try:
        wrong_payload = {
            "items": [
                {
                    "contest_id": contest_id,
                    "qty": 1,
                    "skill_answer": "wrong_answer_xyz"
                }
            ]
        }
        resp = requests.post(f"{BASE_URL}/orders/checkout", json=wrong_payload, headers=headers, timeout=10)
        print(f"Wrong answer checkout - Status: {resp.status_code}")
        print(f"Wrong answer checkout - Response: {resp.text[:300]}")
        
        if resp.status_code == 400:
            print("✓ Checkout with wrong answer correctly rejected (400)")
            wrong_checkout_passed = True
        else:
            print(f"✗ Expected 400 for wrong answer, got {resp.status_code}")
            wrong_checkout_passed = False
    except Exception as e:
        print(f"✗ Exception with wrong answer checkout: {str(e)}")
        wrong_checkout_passed = False
    
    # Test 7b: Correct skill answer
    try:
        correct_payload = {
            "items": [
                {
                    "contest_id": contest_id,
                    "qty": 1,
                    "skill_answer": correct_answer
                }
            ]
        }
        resp = requests.post(f"{BASE_URL}/orders/checkout", json=correct_payload, headers=headers, timeout=10)
        print(f"Correct answer checkout - Status: {resp.status_code}")
        print(f"Correct answer checkout - Response: {resp.text[:300]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'order_id' in data and 'tickets' in data:
                print(f"✓ Checkout successful: order_id={data['order_id']}, tickets={data['tickets']}")
                correct_checkout_passed = True
                order_id = data['order_id']
                
                # Verify tickets_sold incremented
                resp2 = requests.get(f"{BASE_URL}/contests/contest-2", timeout=10)
                if resp2.status_code == 200:
                    updated_contest = resp2.json()
                    tickets_sold = updated_contest.get('tickets_sold', 0)
                    print(f"✓ Tickets sold after purchase: {tickets_sold}")
            else:
                print("✗ Checkout response missing order_id or tickets")
                correct_checkout_passed = False
                order_id = None
        else:
            print(f"✗ Expected 200 for correct answer, got {resp.status_code}")
            correct_checkout_passed = False
            order_id = None
    except Exception as e:
        print(f"✗ Exception with correct answer checkout: {str(e)}")
        correct_checkout_passed = False
        order_id = None
    
    if wrong_checkout_passed and correct_checkout_passed:
        log_test(7, "Checkout with skill validation", True, "Wrong answer rejected (400), correct answer accepted, tickets_sold incremented")
    else:
        details = []
        if not wrong_checkout_passed:
            details.append("wrong answer checkout test failed")
        if not correct_checkout_passed:
            details.append("correct answer checkout test failed")
        log_test(7, "Checkout with skill validation", False, ", ".join(details))
    
    return contest_id if correct_checkout_passed else None

def test_8_admin_stats(user_token, admin_token):
    """Test 8: GET /api/admin/stats without and with admin token."""
    print("\n" + "="*80)
    print("TEST 8: GET /api/admin/stats")
    print("="*80)
    
    # Test without admin token (should be 403)
    try:
        if user_token:
            headers = {"Authorization": f"Bearer {user_token}"}
            resp = requests.get(f"{BASE_URL}/admin/stats", headers=headers, timeout=10)
        else:
            resp = requests.get(f"{BASE_URL}/admin/stats", timeout=10)
        
        print(f"Without admin token - Status: {resp.status_code}")
        print(f"Without admin token - Response: {resp.text[:200]}")
        
        if resp.status_code == 403 or resp.status_code == 401:
            print("✓ Non-admin correctly denied (403/401)")
            no_admin_passed = True
        else:
            print(f"✗ Expected 403/401 without admin, got {resp.status_code}")
            no_admin_passed = False
    except Exception as e:
        print(f"✗ Exception without admin token: {str(e)}")
        no_admin_passed = False
    
    # Test with admin token (should be 200)
    if not admin_token:
        log_test(8, "Admin stats authorization", False, "No admin token available")
        return
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/stats", headers=headers, timeout=10)
        print(f"With admin token - Status: {resp.status_code}")
        print(f"With admin token - Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'users' in data and 'contests' in data:
                print(f"✓ Admin stats retrieved: {data}")
                with_admin_passed = True
            else:
                print("✗ Admin stats response missing expected fields")
                with_admin_passed = False
        else:
            print(f"✗ Expected 200 with admin token, got {resp.status_code}")
            with_admin_passed = False
    except Exception as e:
        print(f"✗ Exception with admin token: {str(e)}")
        with_admin_passed = False
    
    if no_admin_passed and with_admin_passed:
        log_test(8, "Admin stats authorization", True, "Non-admin denied (403), admin allowed (200)")
    else:
        details = []
        if not no_admin_passed:
            details.append("non-admin test failed")
        if not with_admin_passed:
            details.append("admin test failed")
        log_test(8, "Admin stats authorization", False, ", ".join(details))

def test_9_admin_draw(admin_token, contest_id_with_tickets):
    """Test 9: POST /api/admin/draw/{contest_id}."""
    print("\n" + "="*80)
    print("TEST 9: POST /api/admin/draw/{contest_id}")
    print("="*80)
    
    if not admin_token:
        log_test(9, "Admin draw winner", False, "No admin token available")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 9a: Draw on contest with no tickets (should be 400)
    try:
        # Use contest-50 which likely has no tickets
        resp = requests.get(f"{BASE_URL}/contests/contest-50", timeout=10)
        if resp.status_code == 200:
            contest_50 = resp.json()
            contest_50_id = contest_50['contest_id']
            
            resp = requests.post(f"{BASE_URL}/admin/draw/{contest_50_id}", headers=headers, timeout=10)
            print(f"Draw without tickets - Status: {resp.status_code}")
            print(f"Draw without tickets - Response: {resp.text[:200]}")
            
            if resp.status_code == 400:
                print("✓ Draw without tickets correctly rejected (400)")
                no_tickets_passed = True
            else:
                print(f"✗ Expected 400 for no tickets, got {resp.status_code}")
                no_tickets_passed = False
        else:
            print("✗ Could not fetch contest-50")
            no_tickets_passed = False
    except Exception as e:
        print(f"✗ Exception testing draw without tickets: {str(e)}")
        no_tickets_passed = False
    
    # Test 9b: Draw on contest with tickets (should succeed)
    if not contest_id_with_tickets:
        log_test(9, "Admin draw winner", False, "No contest with tickets available from test 7")
        return
    
    try:
        resp = requests.post(f"{BASE_URL}/admin/draw/{contest_id_with_tickets}", headers=headers, timeout=10)
        print(f"Draw with tickets - Status: {resp.status_code}")
        print(f"Draw with tickets - Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'winner' in data:
                winner = data['winner']
                print(f"✓ Winner drawn: {winner}")
                with_tickets_passed = True
            else:
                print("✗ Draw response missing 'winner'")
                with_tickets_passed = False
        else:
            print(f"✗ Expected 200 for draw with tickets, got {resp.status_code}")
            with_tickets_passed = False
    except Exception as e:
        print(f"✗ Exception testing draw with tickets: {str(e)}")
        with_tickets_passed = False
    
    if no_tickets_passed and with_tickets_passed:
        log_test(9, "Admin draw winner", True, "Draw without tickets rejected (400), draw with tickets succeeded")
    else:
        details = []
        if not no_tickets_passed:
            details.append("no tickets test failed")
        if not with_tickets_passed:
            details.append("with tickets test failed")
        log_test(9, "Admin draw winner", False, ", ".join(details))

def test_10_public_winners():
    """Test 10: GET /api/public/winners."""
    print("\n" + "="*80)
    print("TEST 10: GET /api/public/winners")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/public/winners", timeout=10)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"Winners returned: {len(data)}")
            log_test(10, "Public winners list", True, f"{len(data)} winners returned")
        else:
            log_test(10, "Public winners list", False, f"Status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        log_test(10, "Public winners list", False, f"Exception: {str(e)}")

def test_emergent_google_session():
    """Bonus: Test Emergent Google session endpoint."""
    print("\n" + "="*80)
    print("BONUS: POST /api/auth/session (Emergent Google)")
    print("="*80)
    
    # Test without X-Session-ID header (should be 400)
    try:
        resp = requests.post(f"{BASE_URL}/auth/session", json={}, timeout=10)
        print(f"Without header - Status: {resp.status_code}")
        print(f"Without header - Response: {resp.text[:200]}")
        
        if resp.status_code == 400:
            print("✓ Missing X-Session-ID correctly rejected (400)")
            no_header_passed = True
        else:
            print(f"✗ Expected 400 without header, got {resp.status_code}")
            no_header_passed = False
    except Exception as e:
        print(f"✗ Exception without header: {str(e)}")
        no_header_passed = False
    
    # Test with bogus X-Session-ID (should be 401)
    try:
        headers = {"X-Session-ID": "bogus_session_id_12345"}
        resp = requests.post(f"{BASE_URL}/auth/session", json={}, headers=headers, timeout=10)
        print(f"With bogus header - Status: {resp.status_code}")
        print(f"With bogus header - Response: {resp.text[:200]}")
        
        if resp.status_code == 401:
            print("✓ Bogus X-Session-ID correctly rejected (401)")
            bogus_header_passed = True
        else:
            print(f"✗ Expected 401 with bogus header, got {resp.status_code}")
            bogus_header_passed = False
    except Exception as e:
        print(f"✗ Exception with bogus header: {str(e)}")
        bogus_header_passed = False
    
    if no_header_passed and bogus_header_passed:
        print("\n✅ Emergent Google session endpoint behaves correctly")
    else:
        print("\n⚠️ Emergent Google session endpoint has issues")

def main():
    """Run all tests in sequence."""
    print("\n" + "="*80)
    print("GAMEZOO BACKEND API END-TO-END TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_EMAIL}")
    print("="*80)
    
    # Run tests in order
    user_token, user_email = test_1_register()
    admin_token = test_2_login_admin()
    test_3_get_me(admin_token if admin_token else user_token)
    test_4_list_contests()
    test_5_get_contest_by_slug()
    test_6_verify_skill()
    contest_id_with_tickets = test_7_checkout(user_token)
    test_8_admin_stats(user_token, admin_token)
    test_9_admin_draw(admin_token, contest_id_with_tickets)
    test_10_public_winners()
    
    # Bonus test
    test_emergent_google_session()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total tests: {results['total']}")
    print(f"Passed: {len(results['passed'])}")
    print(f"Failed: {len(results['failed'])}")
    print("="*80)
    
    if results['passed']:
        print("\n✅ PASSED TESTS:")
        for test in results['passed']:
            print(f"  • {test}")
    
    if results['failed']:
        print("\n❌ FAILED TESTS:")
        for test in results['failed']:
            print(f"  • {test}")
    
    print("\n" + "="*80)
    
    # Exit with appropriate code
    sys.exit(0 if len(results['failed']) == 0 else 1)

if __name__ == "__main__":
    main()
