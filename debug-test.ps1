# Debug test script for team battle force-end endpoint
# This script tests the debug endpoint by calling it with admin credentials

$BASE_URL = "http://localhost:5001"
$ADMIN_USER = "admin"
$ADMIN_PASS = "admin123"

Write-Host "=== Team Battle Debug Endpoint Test ===" -ForegroundColor Cyan
Write-Host "Base URL: $BASE_URL" -ForegroundColor Gray
Write-Host ""

# Step 1: Login as admin to get session cookie
Write-Host "[1] Logging in as admin..." -ForegroundColor Yellow
$loginBody = @{
    username = $ADMIN_USER
    password = $ADMIN_PASS
} | ConvertTo-Json

try {
    $loginResponse = Invoke-WebRequest -Uri "$BASE_URL/api/login" `
        -Method Post `
        -Body $loginBody `
        -ContentType "application/json" `
        -SessionVariable session `
        -UseBasicParsing -ErrorAction Stop
    
    Write-Host "✓ Login successful" -ForegroundColor Green
    Write-Host "Session cookie: $($session.Cookies | Out-String)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Get all active game sessions from WebSocket connections
# (In a real scenario, you'd have gameId from a running battle)
Write-Host ""
Write-Host "[2] Looking for active team battles..." -ForegroundColor Yellow
Write-Host "Note: Normally you'd capture gameId from an in-progress team battle." -ForegroundColor Gray
Write-Host ""

# For this test, we'll use a placeholder gameId
# In reality, you'd inspect the server logs or browser console to find a real gameId
$GAME_ID = "test-game-session-001"
$TEAM_ID = "team-a-001"

Write-Host "[3] Calling debug endpoint to force-end team battle..." -ForegroundColor Yellow
Write-Host "Parameters:" -ForegroundColor Gray
Write-Host "  - gameId: $GAME_ID" -ForegroundColor Gray
Write-Host "  - teamId (optional): $TEAM_ID" -ForegroundColor Gray
Write-Host ""

$debugBody = @{
    gameId = $GAME_ID
    winningTeamId = $TEAM_ID
} | ConvertTo-Json

try {
    $debugResponse = Invoke-WebRequest -Uri "$BASE_URL/api/debug/force-end-team-battle" `
        -Method Post `
        -Body $debugBody `
        -ContentType "application/json" `
        -WebSession $session `
        -UseBasicParsing -ErrorAction Stop
    
    $result = $debugResponse.Content | ConvertFrom-Json
    Write-Host "✓ Debug endpoint called successfully" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Gray
    Write-Host ($result | ConvertTo-Json -Depth 10) -ForegroundColor Cyan
} catch {
    $errorMsg = $_.Exception.Message
    Write-Host "✗ Debug endpoint call failed: $errorMsg" -ForegroundColor Red
    
    # Try to extract response body for more details
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response body: $responseBody" -ForegroundColor Yellow
        } catch { }
    }
    exit 1
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host "Check the server console for detailed logs around [Team Battle] markers" -ForegroundColor Gray
