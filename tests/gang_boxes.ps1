param(
  [string]$PocketBase = (Join-Path $PSScriptRoot '..\pocketbase.exe'),
  [int]$Port = 18096
)

$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$Data = Join-Path $TempRoot ('trenchnote-gang-test-' + [guid]::NewGuid().ToString('N'))
$Log = Join-Path $Data 'server.log'
$Base = "http://127.0.0.1:$Port"
$Server = $null
$Passed = 0
$AdminToken = ''

function Ok([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
  $script:Passed++
  Write-Host "ok $script:Passed - $Message"
}

function Api([string]$Method, [string]$Path, $Body = $null, [string]$Token = '') {
  $headers = @{}
  if ($Token) { $headers.Authorization = $Token }
  $args = @{ Method = $Method; Uri = "$Base/api/$Path"; Headers = $headers }
  if ($null -ne $Body) {
    $args.ContentType = 'application/json'
    $args.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
  }
  try { Invoke-RestMethod @args }
  catch {
    Write-Host "API failure: $Method /api/$Path" -ForegroundColor Red
    if ($script:AdminToken) {
      try {
        $logs = Invoke-RestMethod "$Base/api/logs?sort=-created&perPage=3" `
          -Headers @{ Authorization = $script:AdminToken }
        $logs.items | ForEach-Object { Write-Host (($_ | ConvertTo-Json -Depth 6 -Compress)) -ForegroundColor DarkYellow }
      } catch {}
    }
    throw
  }
}

function Rejected([scriptblock]$Action, [string]$Message) {
  try { & $Action; Ok $false $Message }
  catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    Ok ($status -in 400, 403, 404) $Message
  }
}

function CreateAsset($Token, $Item, $Tag, [bool]$Box = $false) {
  Write-Host "create asset $Tag (box=$Box)"
  Api POST 'collections/assets/records' @{
    item = $Item; tag_code = $Tag; ownership = 'owned'; is_container = $Box
  } $Token
}

function MoveAsset($Token, $Asset, $From, $To, $Who = 'Test Crew') {
  Write-Host "move asset $Asset ($From -> $To)"
  $move = Api POST 'collections/movements/records' @{
    asset = $Asset; from_location = $From; to_location = $To
    moved_by = $Who; item = ''; quantity = 0
  } $Token
  Api PATCH "collections/assets/records/$Asset" @{ current_location = $To } $Token | Out-Null
  $move
}

New-Item -ItemType Directory -Path $Data | Out-Null
try {
  & $PocketBase migrate up --dir $Data --migrationsDir (Join-Path $Repo 'pb_migrations') `
    --hooksDir (Join-Path $Repo 'pb_hooks') | Out-Host
  & $PocketBase superuser create 'admin@trenchnote.test' 'TrenchNote-Test-123!' `
    --dir $Data --migrationsDir (Join-Path $Repo 'pb_migrations') `
    --hooksDir (Join-Path $Repo 'pb_hooks') | Out-Null

  # Start-Process on Windows PowerShell can fail when the host environment
  # contains both Path and PATH. ProcessStartInfo avoids that host bug while
  # still guaranteeing a hidden, non-interactive test server.
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $PocketBase
  $psi.Arguments = 'serve ' +
    "--http=127.0.0.1:$Port " +
    "--dir=`"$Data`" " +
    "--migrationsDir=`"$(Join-Path $Repo 'pb_migrations')`" " +
    "--hooksDir=`"$(Join-Path $Repo 'pb_hooks')`" " +
    "--publicDir=`"$(Join-Path $Repo 'pb_public')`""
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $Server = [Diagnostics.Process]::Start($psi)

  for ($i = 0; $i -lt 50; $i++) {
    try { Invoke-WebRequest "$Base/api/health" -UseBasicParsing | Out-Null; break }
    catch { Start-Sleep -Milliseconds 100 }
  }

  $admin = Api POST 'collections/_superusers/auth-with-password' @{
    identity = 'admin@trenchnote.test'; password = 'TrenchNote-Test-123!'
  }
  $AdminToken = $admin.token
  $user = Api POST 'collections/users/records' @{
    email = 'field@trenchnote.test'; password = 'Field-Test-123!'
    passwordConfirm = 'Field-Test-123!'; name = 'Field Test'
  } $admin.token
  $auth = Api POST 'collections/users/auth-with-password' @{
    identity = 'field@trenchnote.test'; password = 'Field-Test-123!'
  }
  $token = $auth.token

  $siteA = Api POST 'collections/locations/records' @{ name = 'Site A'; type = 'jobsite' } $token
  $siteB = Api POST 'collections/locations/records' @{ name = 'Site B'; type = 'jobsite' } $token
  $missing = Api GET 'collections/locations/records/tnmissingxfer01' $null $token
  Ok ($missing.name -eq 'Missing in transfer') 'ADR 0020 missing-location convention exists'

  $unique = Api POST 'collections/items/records' @{
    name = 'Test equipment'; tracking_mode = 'unique'
  } $token
  $bulk = Api POST 'collections/items/records' @{
    name = 'Test bulk'; tracking_mode = 'bulk'
  } $token
  $box = CreateAsset $token $unique.id 'GB01' $true
  $box2 = CreateAsset $token $unique.id 'GB02' $true
  $child = CreateAsset $token $unique.id 'K001'
  $child2 = CreateAsset $token $unique.id 'K002'
  $normal = CreateAsset $token $unique.id 'A001'
  $nonbox = CreateAsset $token $unique.id 'A002'

  MoveAsset $token $box.id '' $siteA.id | Out-Null
  MoveAsset $token $box2.id '' $siteA.id | Out-Null
  MoveAsset $token $child.id '' $siteA.id | Out-Null
  MoveAsset $token $child2.id '' $siteA.id | Out-Null
  MoveAsset $token $normal.id '' $siteA.id | Out-Null

  $add = Api POST 'collections/container_events/records' @{
    asset_id = $child.id; container_id = $box.id; action = 'added'
    by = 'R. Tester'; location = $siteA.id
  } $token
  $addedChild = Api GET "collections/assets/records/$($child.id)" $null $token
  Ok ($addedChild.container_id -eq $box.id -and -not $addedChild.current_location) `
    'add event atomically attaches child and clears direct location cache'

  Rejected { Api PATCH "collections/assets/records/$($child.id)" @{ container_id = $box2.id } $token } `
    'direct unledgered membership patch is rejected'
  Rejected { Api POST 'collections/container_events/records' @{
      asset_id = $box2.id; container_id = $box.id; action = 'added'; by = 'x'; location = $siteA.id
    } $token } 'container-in-container is rejected'
  Rejected { Api POST 'collections/container_events/records' @{
      asset_id = $normal.id; container_id = $nonbox.id; action = 'added'; by = 'x'; location = $siteA.id
    } $token } 'non-container target is rejected'
  Rejected { Api PATCH "collections/assets/records/$($box.id)" @{ is_container = $false } $admin.token } `
    'model hook rejects unmarking a box that still has contents'
  Rejected { Api POST 'collections/movements/records' @{
      asset = $child.id; from_location = $siteA.id; to_location = $siteB.id
      item = ''; quantity = 0; moved_by = 'x'
    } $token } 'contained child cannot be moved independently'

  $childMoveCountBefore = (Api GET "collections/movements/records?filter=asset='$($child.id)'&perPage=100" $null $token).totalItems
  MoveAsset $token $box.id $siteA.id $siteB.id | Out-Null
  $childMoveCountAfter = (Api GET "collections/movements/records?filter=asset='$($child.id)'&perPage=100" $null $token).totalItems
  $expanded = Api GET "collections/assets/records/$($child.id)?expand=container_id.current_location" $null $token
  Ok ($childMoveCountAfter -eq $childMoveCountBefore) 'moving a box creates no fan-out child movement'
  Ok ($expanded.expand.container_id.current_location -eq $siteB.id) 'contained child derives Site B through box'

  $remove = Api POST 'collections/container_events/records' @{
    asset_id = $child.id; container_id = $box.id; action = 'removed'
    by = 'R. Tester'; location = $siteB.id
  } $token
  $removedChild = Api GET "collections/assets/records/$($child.id)" $null $token
  $childMoves = Api GET "collections/movements/records?filter=asset='$($child.id)'&sort=created&perPage=100" $null $token
  Ok (-not $removedChild.container_id -and $removedChild.current_location -eq $siteB.id) `
    'removal materializes child at selected location'
  Ok ($childMoves.totalItems -eq 2 -and $childMoves.items[-1].to_location -eq $siteB.id) `
    'removal writes a direct materialization movement'
  Rejected { Api PATCH "collections/container_events/records/$($add.id)" @{ by = 'rewrite' } $token } `
    'container events are append-only'
  Rejected { Api DELETE "collections/container_events/records/$($add.id)" $null $token } `
    'container events cannot be deleted'

  Api POST 'collections/container_events/records' @{
    asset_id = $child.id; container_id = $box.id; action = 'added'
    by = 'R. Tester'; location = $siteB.id
  } $token | Out-Null
  MoveAsset $token $box.id $siteB.id $siteA.id | Out-Null

  $auditId = 'audittest000001'
  $auditBody = @{
    id = $auditId; container_id = $box.id; performed_by = 'R. Tester'
    performed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss.fff'Z'")
    results = @(@{ asset_id = $child.id; result = 'present' })
  }
  $audit = Api POST 'collections/kit_audits/records' $auditBody $token
  $missingChild = Api GET "collections/assets/records/$($child.id)" $null $token
  $missingEvents = Api GET "collections/container_events/records?filter=asset_id='$($child.id)'%26%26action='removed'&perPage=100" $null $token
  $missingMoves = Api GET "collections/movements/records?filter=asset='$($child.id)'%26%26to_location='tnmissingxfer01'&perPage=100" $null $token
  Ok (-not $missingChild.container_id -and $missingChild.current_location -eq 'tnmissingxfer01') `
    'missing audit atomically detaches child into missing location'
  Ok ($missingEvents.totalItems -eq 2 -and $missingMoves.totalItems -eq 1) `
    'missing audit creates one removal event and one missing movement'
  Rejected { Api PATCH "collections/kit_audits/records/$($audit.id)" @{ performed_by = 'rewrite' } $token } `
    'kit audits are append-only'
  Rejected { Api POST 'collections/kit_audits/records' $auditBody $token } `
    'replaying a pre-generated audit id is rejected as duplicate'
  $stillOne = Api GET "collections/movements/records?filter=asset='$($child.id)'%26%26to_location='tnmissingxfer01'&perPage=100" $null $token
  Ok ($stillOne.totalItems -eq 1) 'audit replay cannot duplicate missing side effects'

  Api POST 'collections/container_events/records' @{
    asset_id = $child2.id; container_id = $box.id; action = 'added'
    by = 'R. Tester'; location = $siteA.id
  } $token | Out-Null
  $manifest = Api POST 'collections/manifests/records' @{
    from_location = $siteA.id; to_location = $siteB.id; created_by = $user.id
    driver_name = 'R. Tester'; status = 'draft'; received_by = ''
  } $token
  Api POST 'collections/manifest_lines/records' @{
    manifest = $manifest.id; asset = $box.id; item = ''; quantity = 0
    sent_quantity = 1; received_quantity = 0
  } $token | Out-Null
  Ok $true 'transfer manifest accepts the whole box as one asset line'
  Rejected { Api POST 'collections/manifest_lines/records' @{
      manifest = $manifest.id; asset = $child2.id; item = ''; quantity = 0
      sent_quantity = 1; received_quantity = 0
    } $token } 'transfer manifest rejects an individually contained child'
  Rejected { Api POST 'collections/reservations/records' @{
      asset = $box.id; requested_by = 'x'; needed_by = '2026-08-01 00:00:00.000Z'
    } $token } 'scope fence rejects reservations on boxes'

  MoveAsset $token $normal.id $siteA.id $siteB.id | Out-Null
  Ok $true 'ordinary unique-asset movement still succeeds'
  Api POST 'collections/movements/records' @{
    asset = ''; item = $bulk.id; quantity = 10; from_location = ''; to_location = $siteA.id; moved_by = 'x'
  } $token | Out-Null
  Api POST 'collections/movements/records' @{
    asset = ''; item = $bulk.id; quantity = 4; from_location = $siteA.id; to_location = $siteB.id; moved_by = 'x'
  } $token | Out-Null
  Api POST 'collections/movements/records' @{
    asset = ''; item = $bulk.id; quantity = 1; from_location = $siteB.id; to_location = ''; moved_by = 'x'
  } $token | Out-Null
  Ok $true 'bulk receive, transfer, and consume shapes still succeed'
  Rejected { Api POST 'collections/movements/records' @{
      asset = $normal.id; item = $bulk.id; quantity = 1; to_location = $siteA.id
    } $token } 'malformed mixed movement remains rejected'

  Write-Host "PASS: $Passed gang-box integration assertions"
}
finally {
  if ($Server -and -not $Server.HasExited) {
    Stop-Process -Id $Server.Id -Force
    $Server.WaitForExit()
  }
  if ($Server -and $Passed -lt 22) {
    $stderr = $Server.StandardError.ReadToEnd()
    $stdout = $Server.StandardOutput.ReadToEnd()
    if ($stderr) { Write-Host $stderr -ForegroundColor DarkYellow }
    if ($stdout) { Write-Host $stdout -ForegroundColor DarkYellow }
  }
  $resolvedData = [IO.Path]::GetFullPath($Data)
  if ($resolvedData.StartsWith($TempRoot, [StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path $resolvedData -Leaf).StartsWith('trenchnote-gang-test-')) {
    Remove-Item -LiteralPath $resolvedData -Recurse -Force -ErrorAction SilentlyContinue
  }
}
