param(
  [string]$Url = 'http://localhost:3080',
  [int]$DockerTimeoutSeconds = 180,
  [int]$WebTimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$ComposeFile = Join-Path $ProjectRoot 'docker-compose.local.yml'
$LogDir = Join-Path $ProjectRoot 'logs'
$LogFile = Join-Path $LogDir 'start-local-web.log'
$DockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'

function Write-StartupLog {
  param([string]$Message)

  if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  }

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $LogFile -Value "[$timestamp] $Message"
}

function Test-DockerReady {
  try {
    docker info *> $null
    return $true
  } catch {
    return $false
  }
}

function Wait-DockerReady {
  $deadline = (Get-Date).AddSeconds($DockerTimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (Test-DockerReady) {
      return $true
    }
    Start-Sleep -Seconds 3
  }

  return $false
}

function Wait-WebReady {
  $deadline = (Get-Date).AddSeconds($WebTimeoutSeconds)
  $readyUrl = "$Url/readyz"

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $readyUrl -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -eq 200) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  return $false
}

try {
  Write-StartupLog 'Startup requested.'

  if (-not (Test-DockerReady)) {
    if (Test-Path $DockerDesktop) {
      Write-StartupLog 'Starting Docker Desktop.'
      Start-Process -FilePath $DockerDesktop -WindowStyle Hidden
    } else {
      Write-StartupLog 'Docker Desktop executable was not found.'
    }
  }

  if (-not (Wait-DockerReady)) {
    Write-StartupLog 'Docker did not become ready before timeout.'
    exit 1
  }

  Write-StartupLog 'Docker is ready. Starting LibreChat compose stack.'
  Push-Location $ProjectRoot
  try {
    $previousErrorActionPreference = $ErrorActionPreference
    $nativePreference = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
    if ($nativePreference) {
      $previousNativeCommandPreference = $PSNativeCommandUseErrorActionPreference
      $PSNativeCommandUseErrorActionPreference = $false
    }

    $ErrorActionPreference = 'Continue'
    $composeOutput = docker compose -f $ComposeFile up -d 2>&1
    $composeExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference

    if ($nativePreference) {
      $PSNativeCommandUseErrorActionPreference = $previousNativeCommandPreference
    }

    $composeOutput | ForEach-Object { Write-StartupLog $_ }
    if ($composeExitCode -ne 0) {
      throw "docker compose failed with exit code $composeExitCode"
    }
  } finally {
    Pop-Location
  }

  if (-not (Wait-WebReady)) {
    Write-StartupLog 'LibreChat did not become ready before timeout.'
    exit 1
  }

  Write-StartupLog "LibreChat is ready. Opening $Url."
  Start-Process $Url
} catch {
  Write-StartupLog "Startup failed: $($_.Exception.Message)"
  exit 1
}
