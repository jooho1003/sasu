# UI Automation helper for the TEST browser's real screen-share UI (session 1 only).
# Only top-level windows owned by -ProcessId (the Playwright-launched browser process) are searched, and inside them
# only the window whose name matches -Scope, so the user's own browsers/apps are never touched.
#   uia.ps1 -ProcessId <pid> -Action dump -Out file.json [-Scope '*']
#   uia.ps1 -ProcessId <pid> -Action invoke|select|toggle|state -Name "<exact>" | -Like "<pattern>" [-Type Button] [-Nth 0]
param([Parameter(Mandatory)][int]$ProcessId, [Parameter(Mandatory)][string]$Action, [string]$Name = "", [string]$Like = "", [string]$Out = "",
  [string]$Type = "", [int]$Nth = 0, [string]$Scope = '*공유할 항목을 선택하세요*')
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$root = $A::RootElement
$pidCond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $ProcessId)
$scopes = New-Object System.Collections.ArrayList
foreach ($w in $root.FindAll($TS::Children, $pidCond)) {
  if ($w.Current.Name -like $Scope) { [void]$scopes.Add($w); continue }
  $winCond = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Window)
  foreach ($d in $w.FindAll($TS::Descendants, $winCond)) { if ($d.Current.Name -like $Scope) { [void]$scopes.Add($d) } }
}
if ($scopes.Count -eq 0) { 'scope_not_found'; exit 4 }
$items = New-Object System.Collections.ArrayList
foreach ($s in $scopes) {
  foreach ($e in $s.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    try {
      $ct = $e.Current.ControlType.ProgrammaticName -replace 'ControlType\.', ''
      [void]$items.Add([pscustomobject]@{ scope = $s.Current.Name; type = $ct; name = $e.Current.Name; enabled = $e.Current.IsEnabled; el = $e })
    } catch {}
  }
}
if ($Action -eq 'dump') {
  $json = @($items | Select-Object scope, type, name, enabled) | ConvertTo-Json -Compress
  if ($Out) { [IO.File]::WriteAllText($Out, $json, [Text.UTF8Encoding]::new($false)) } else { $json }
  exit 0
}
$found = @($items | Where-Object { (-not $Type -or $_.type -eq $Type) -and (($Name -and $_.name -eq $Name) -or ($Like -and $_.name -like $Like)) })
if ($found.Count -le $Nth) { "not_found count=$($found.Count)"; exit 2 }
$e = $found[$Nth].el
$P = @{ select = [System.Windows.Automation.SelectionItemPattern]::Pattern; toggle = [System.Windows.Automation.TogglePattern]::Pattern;
  state = [System.Windows.Automation.TogglePattern]::Pattern; invoke = [System.Windows.Automation.InvokePattern]::Pattern }
$obj = $null
$done = $null
if ($e.TryGetCurrentPattern($P[$Action], [ref]$obj)) {
  switch ($Action) {
    'select' { $obj.Select(); $done = 'select' }
    'toggle' { $obj.Toggle(); $done = 'toggle:' + $obj.Current.ToggleState }
    'state' { $done = 'state:' + $obj.Current.ToggleState }
    'invoke' { $obj.Invoke(); $done = 'invoke' }
  }
} elseif ($Action -in @('select', 'invoke', 'toggle')) {
  foreach ($alt in @([System.Windows.Automation.InvokePattern]::Pattern, [System.Windows.Automation.SelectionItemPattern]::Pattern, [System.Windows.Automation.TogglePattern]::Pattern)) {
    if ($e.TryGetCurrentPattern($alt, [ref]$obj)) {
      if ($alt -eq [System.Windows.Automation.InvokePattern]::Pattern) { $obj.Invoke(); $done = 'invoke(fallback)' }
      elseif ($alt -eq [System.Windows.Automation.SelectionItemPattern]::Pattern) { $obj.Select(); $done = 'select(fallback)' }
      else { $obj.Toggle(); $done = 'toggle(fallback):' + $obj.Current.ToggleState }
      break
    }
  }
}
if (-not $done) { "no_pattern type=$($found[$Nth].type)"; exit 3 }
"$done type=$($found[$Nth].type)"
