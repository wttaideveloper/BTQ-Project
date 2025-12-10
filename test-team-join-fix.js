#!/usr/bin/env node

/**
 * Comprehensive test script to verify the Team Battle join request fix
 * This script tests the team ID matching logic that was implemented to fix the issue
 */

console.log('🧪 Starting Team Battle Join Request Fix Test');
console.log('===========================================\n');

/**
 * Test Case 1: Direct ID Matching (Original Working Case)
 */
function testDirectMatching() {
  console.log('Test 1: Direct ID Matching');
  console.log('--------------------------');

  const joinRequest = {
    id: 'jr-123',
    teamId: 'fa6dd1ec-d752-4f46-ade6-c3800cf353b6-team-a'
  };

  const team = {
    id: 'fa6dd1ec-d752-4f46-ade6-c3800cf353b6-team-a',
    name: 'Cap-A-1'
  };

  // Apply the fix logic
  const joinRequestBaseId = joinRequest.teamId?.replace(/-team-[ab]$/i, '');
  const teamBaseId = team.id?.replace(/-team-[ab]$/i, '');

  const directMatch = joinRequest.teamId === team.id;
  const baseMatch = joinRequestBaseId === teamBaseId;

  const result = directMatch || baseMatch;

  console.log(`Join Request Team ID: ${joinRequest.teamId}`);
  console.log(`Team ID: ${team.id}`);
  console.log(`Direct Match: ${directMatch}`);
  console.log(`Base Match: ${baseMatch}`);
  console.log(`Final Result: ${result ? '✅ MATCH' : '❌ NO MATCH'}`);
  console.log('');

  return result;
}

/**
 * Test Case 2: Base ID Matching (The Fix Case)
 */
function testBaseMatching() {
  console.log('Test 2: Base ID Matching (The Fix)');
  console.log('-----------------------------------');

  const joinRequest = {
    id: 'jr-456',
    teamId: '4222c849-5d51-466d-8c29-25637412b85e-team-a'
  };

  const team = {
    id: 'fa6dd1ec-d752-4f46-ade6-c3800cf353b6-team-a',
    name: 'Cap-A-1'
  };

  // Apply the fix logic
  const joinRequestBaseId = joinRequest.teamId?.replace(/-team-[ab]$/i, '');
  const teamBaseId = team.id?.replace(/-team-[ab]$/i, '');

  const directMatch = joinRequest.teamId === team.id;
  const baseMatch = joinRequestBaseId === teamBaseId;

  const result = directMatch || baseMatch;

  console.log(`Join Request Team ID: ${joinRequest.teamId}`);
  console.log(`Team ID: ${team.id}`);
  console.log(`Join Request Base ID: ${joinRequestBaseId}`);
  console.log(`Team Base ID: ${teamBaseId}`);
  console.log(`Direct Match: ${directMatch}`);
  console.log(`Base Match: ${baseMatch}`);
  console.log(`Final Result: ${result ? '✅ MATCH' : '❌ NO MATCH'}`);
  console.log('');

  return result;
}

/**
 * Test Case 3: Different Team IDs (Should Not Match)
 */
function testNoMatch() {
  console.log('Test 3: Different Team IDs (Should Not Match)');
  console.log('----------------------------------------------');

  const joinRequest = {
    id: 'jr-789',
    teamId: 'b610102e-2248-4af3-a994-56b1d8ae222e-team-b'
  };

  const team = {
    id: 'fa6dd1ec-d752-4f46-ade6-c3800cf353b6-team-a',
    name: 'Cap-A-1'
  };

  // Apply the fix logic
  const joinRequestBaseId = joinRequest.teamId?.replace(/-team-[ab]$/i, '');
  const teamBaseId = team.id?.replace(/-team-[ab]$/i, '');

  const directMatch = joinRequest.teamId === team.id;
  const baseMatch = joinRequestBaseId === teamBaseId;

  const result = directMatch || baseMatch;

  console.log(`Join Request Team ID: ${joinRequest.teamId}`);
  console.log(`Team ID: ${team.id}`);
  console.log(`Join Request Base ID: ${joinRequestBaseId}`);
  console.log(`Team Base ID: ${teamBaseId}`);
  console.log(`Direct Match: ${directMatch}`);
  console.log(`Base Match: ${baseMatch}`);
  console.log(`Final Result: ${result ? '✅ MATCH' : '❌ NO MATCH (Expected)'}`);
  console.log('');

  return !result; // Should NOT match
}

/**
 * Test Case 4: Real-world scenario from the logs
 */
function testRealWorldScenario() {
  console.log('Test 4: Real-world Scenario from Logs');
  console.log('--------------------------------------');

  // From the logs: teamId=2e36ace3-fe42-4af9-8492-f2d02c5ad0b8-team-a
  // currentTeamId=fa6dd1ec-d752-4f46-ade6-c3800cf353b6-team-a
  const joinRequest = {
    id: 'jr-1765283150069-xafj9g',
    teamId: '2e36ace3-fe42-4af9-8492-f2d02c5ad0b8-team-a'
  };

  const team = {
    id: 'fa6dd1ec-d752-4f46-ade6-c3800cf353b6-team-a',
    name: 'Cap-A-1'
  };

  // Apply the fix logic
  const joinRequestBaseId = joinRequest.teamId?.replace(/-team-[ab]$/i, '');
  const teamBaseId = team.id?.replace(/-team-[ab]$/i, '');

  const directMatch = joinRequest.teamId === team.id;
  const baseMatch = joinRequestBaseId === teamBaseId;

  const result = directMatch || baseMatch;

  console.log(`Join Request Team ID: ${joinRequest.teamId}`);
  console.log(`Team ID: ${team.id}`);
  console.log(`Join Request Base ID: ${joinRequestBaseId}`);
  console.log(`Team Base ID: ${teamBaseId}`);
  console.log(`Direct Match: ${directMatch}`);
  console.log(`Base Match: ${baseMatch}`);
  console.log(`Final Result: ${result ? '✅ MATCH' : '❌ NO MATCH'}`);
  console.log('');

  return result;
}

/**
 * Test Case 5: Edge case - no team suffix
 */
function testNoSuffix() {
  console.log('Test 5: Edge Case - No Team Suffix');
  console.log('-----------------------------------');

  const joinRequest = {
    id: 'jr-999',
    teamId: 'simple-team-id'
  };

  const team = {
    id: 'simple-team-id',
    name: 'Simple Team'
  };

  // Apply the fix logic
  const joinRequestBaseId = joinRequest.teamId?.replace(/-team-[ab]$/i, '');
  const teamBaseId = team.id?.replace(/-team-[ab]$/i, '');

  const directMatch = joinRequest.teamId === team.id;
  const baseMatch = joinRequestBaseId === teamBaseId;

  const result = directMatch || baseMatch;

  console.log(`Join Request Team ID: ${joinRequest.teamId}`);
  console.log(`Team ID: ${team.id}`);
  console.log(`Join Request Base ID: ${joinRequestBaseId}`);
  console.log(`Team Base ID: ${teamBaseId}`);
  console.log(`Direct Match: ${directMatch}`);
  console.log(`Base Match: ${baseMatch}`);
  console.log(`Final Result: ${result ? '✅ MATCH' : '❌ NO MATCH'}`);
  console.log('');

  return result;
}

/**
 * Run all tests and report results
 */
function runAllTests() {
  const tests = [
    { name: 'Direct ID Matching', test: testDirectMatching, expected: true },
    { name: 'Base ID Matching (The Fix)', test: testBaseMatching, expected: true },
    { name: 'Different Team IDs', test: testNoMatch, expected: true },
    { name: 'Real-world Scenario', test: testRealWorldScenario, expected: true },
    { name: 'Edge Case - No Suffix', test: testNoSuffix, expected: true }
  ];

  let passed = 0;
  let failed = 0;

  console.log('Running All Tests...');
  console.log('===================\n');

  tests.forEach((test, index) => {
    try {
      const result = test.test();
      if (result === test.expected) {
        console.log(`✅ Test ${index + 1}: ${test.name} - PASSED`);
        passed++;
      } else {
        console.log(`❌ Test ${index + 1}: ${test.name} - FAILED`);
        failed++;
      }
    } catch (error) {
      console.log(`💥 Test ${index + 1}: ${test.name} - ERROR: ${error.message}`);
      failed++;
    }
    console.log('');
  });

  console.log('Test Summary');
  console.log('============');
  console.log(`Total Tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! The fix is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Please review the implementation.');
  }

  return failed === 0;
}

// Run the tests
const success = runAllTests();

console.log('\nTest Script Completed');
console.log('====================');

process.exit(success ? 0 : 1);