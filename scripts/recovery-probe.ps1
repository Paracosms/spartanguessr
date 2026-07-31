[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$BaseUrl,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputPath,

    [ValidateRange(1, 3600)]
    [int]$DurationSeconds = 180,

    [ValidateRange(1, 15)]
    [int]$RequestTimeoutSeconds = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-SafeBaseUrl {
    param([string]$Candidate)

    try {
        $uri = [System.Uri]$Candidate
    }
    catch {
        throw 'BaseUrl must be an absolute HTTP or HTTPS URL without a query or fragment.'
    }

    if (
        -not $uri.IsAbsoluteUri -or
        ($uri.Scheme -ne 'http' -and $uri.Scheme -ne 'https') -or
        -not [string]::IsNullOrEmpty($uri.Query) -or
        -not [string]::IsNullOrEmpty($uri.Fragment) -or
        -not [string]::IsNullOrEmpty($uri.UserInfo)
    ) {
        throw 'BaseUrl must be an absolute HTTP or HTTPS URL without a query or fragment.'
    }

    return $uri.GetLeftPart([System.UriPartial]::Path).TrimEnd('/')
}

function Get-StatusCodeFromException {
    param([System.Exception]$Exception)

    $current = $Exception
    while ($null -ne $current) {
        $responseProperty = $current.PSObject.Properties['Response']
        $response = if ($null -ne $responseProperty) { $responseProperty.Value } else { $null }
        if ($null -ne $response -and $null -ne $response.StatusCode) {
            try {
                return [int]$response.StatusCode
            }
            catch {
                return $null
            }
        }
        $current = $current.InnerException
    }
    return $null
}

function Write-ProbeRow {
    param(
        [System.IO.StreamWriter]$Writer,
        [string]$Endpoint,
        [Nullable[int]]$StatusCode,
        [string]$Outcome,
        [long]$ElapsedMilliseconds
    )

    $timestamp = [DateTime]::UtcNow.ToString('o')
    $statusField = if ($null -ne $StatusCode) { $StatusCode.ToString() } else { '' }
    $Writer.WriteLine(
        ('"{0}","{1}","{2}","{3}","{4}"' -f
            $timestamp,
            $Endpoint,
            $statusField,
            $Outcome,
            $ElapsedMilliseconds
        )
    )
    $Writer.Flush()
}

$normalizedBaseUrl = Get-SafeBaseUrl -Candidate $BaseUrl
$fullOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($fullOutputPath)
if ([string]::IsNullOrWhiteSpace($outputDirectory)) {
    throw 'OutputPath must include a filename.'
}
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

Add-Type -AssemblyName System.Net.Http
$httpClient = New-Object System.Net.Http.HttpClient
$httpClient.Timeout = [TimeSpan]::FromSeconds($RequestTimeoutSeconds)

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
$writer = New-Object System.IO.StreamWriter($fullOutputPath, $false, $utf8WithoutBom)
$cancelRequested = $false
$cancelHandler = [ConsoleCancelEventHandler] {
    param($sender, $event)
    $event.Cancel = $true
    $script:cancelRequested = $true
}

function Start-ProbeRequest {
    param(
        [string]$Endpoint
    )

    return [PSCustomObject]@{
        Endpoint = $Endpoint
        Timer = [System.Diagnostics.Stopwatch]::StartNew()
        Task = $httpClient.GetAsync(
            $normalizedBaseUrl + $Endpoint,
            [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
        )
    }
}

function Complete-ProbeRequest {
    param(
        [PSCustomObject]$Probe,
        [System.IO.StreamWriter]$Writer
    )

    $statusCode = $null
    $outcome = 'failure'
    $response = $null

    try {
        $response = $Probe.Task.GetAwaiter().GetResult()
        $statusCode = [int]$response.StatusCode
        if ($statusCode -ge 200 -and $statusCode -lt 300) {
            $outcome = 'success'
        }
    }
    catch {
        $statusCode = Get-StatusCodeFromException -Exception $_.Exception
    }
    finally {
        $Probe.Timer.Stop()
        if ($null -ne $response) {
            $response.Dispose()
        }
        Write-ProbeRow -Writer $Writer -Endpoint $Probe.Endpoint -StatusCode $statusCode -Outcome $outcome -ElapsedMilliseconds $Probe.Timer.ElapsedMilliseconds
    }
}

function Complete-ProbeBatch {
    param(
        [object[]]$Probes,
        [System.IO.StreamWriter]$Writer
    )

    $pending = New-Object System.Collections.ArrayList
    foreach ($probe in $Probes) {
        [void]$pending.Add($probe)
    }

    while ($pending.Count -gt 0) {
        for ($index = $pending.Count - 1; $index -ge 0; $index -= 1) {
            $probe = $pending[$index]
            if ($probe.Task.IsCompleted) {
                Complete-ProbeRequest -Probe $probe -Writer $Writer
                $pending.RemoveAt($index)
            }
        }
        if ($pending.Count -gt 0) {
            Start-Sleep -Milliseconds 10
        }
    }
}

[Console]::add_CancelKeyPress($cancelHandler)
try {
    $writer.WriteLine('"timestamp_utc","endpoint","http_status","outcome","elapsed_ms"')
    $writer.Flush()
    $deadline = [DateTime]::UtcNow.AddSeconds($DurationSeconds)

    while ([DateTime]::UtcNow -lt $deadline -and -not $script:cancelRequested) {
        $iterationStartedAt = [DateTime]::UtcNow
        $probes = @(
            Start-ProbeRequest -Endpoint '/health'
            Start-ProbeRequest -Endpoint '/ready'
        )
        Complete-ProbeBatch -Probes $probes -Writer $writer

        $elapsedMilliseconds = ([DateTime]::UtcNow - $iterationStartedAt).TotalMilliseconds
        $remainingMilliseconds = 1000 - [Math]::Ceiling($elapsedMilliseconds)
        if ($remainingMilliseconds -gt 0 -and -not $script:cancelRequested) {
            Start-Sleep -Milliseconds $remainingMilliseconds
        }
    }
}
finally {
    $writer.Flush()
    $writer.Dispose()
    $httpClient.Dispose()
    [Console]::remove_CancelKeyPress($cancelHandler)
}

Write-Output 'Recovery probe finished; the CSV contains sanitized status aggregates only.'
