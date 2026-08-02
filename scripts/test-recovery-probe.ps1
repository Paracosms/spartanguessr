[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$probePath = Join-Path $PSScriptRoot 'recovery-probe.ps1'
$outputPath = Join-Path $env:TEMP ('spartanguessr-day2-recovery-probe-' + [Guid]::NewGuid().ToString('N') + '.csv')
$portReservation = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$portReservation.Start()
$port = ([System.Net.IPEndPoint]$portReservation.LocalEndpoint).Port
$portReservation.Stop()
$prefix = 'http://127.0.0.1:' + $port + '/'

$mock = [PowerShell]::Create()
$mockScript = {
    param([int]$ListenerPort)

    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $ListenerPort)
    $listener.Start()
    $requestCount = 0
    $readyFailureSent = $false
    try {
        while ($requestCount -lt 4) {
            $clients = @(
                $listener.AcceptTcpClient()
                $listener.AcceptTcpClient()
            )
            $requestCount += $clients.Count
            Start-Sleep -Milliseconds 5

            foreach ($client in $clients) {
                try {
                    $stream = $client.GetStream()
                    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
                    $requestLine = $reader.ReadLine()
                    while (-not [string]::IsNullOrEmpty($reader.ReadLine())) {
                    }

                    $statusCode = if ($requestLine -match '^GET /ready(?:\s|$)' -and -not $readyFailureSent) {
                        $readyFailureSent = $true
                        503
                    }
                    else {
                        200
                    }
                    $statusText = if ($statusCode -eq 200) { 'OK' } else { 'Service Unavailable' }
                    $crlf = [String][char]13 + [char]10
                    $responseText = 'HTTP/1.1 ' + $statusCode + ' ' + $statusText + $crlf + 'Content-Type: application/json' + $crlf + 'Content-Length: 2' + $crlf + 'Connection: close' + $crlf + $crlf + '{}'
                    $bytes = [System.Text.Encoding]::ASCII.GetBytes($responseText)
                    $stream.Write($bytes, 0, $bytes.Length)
                    $stream.Flush()
                    $reader.Dispose()
                }
                finally {
                    $client.Close()
                }
            }
        }
    }
    finally {
        $listener.Stop()
    }
}

try {
    [void]$mock.AddScript($mockScript.ToString()).AddArgument($port)
    $mockInvocation = $mock.BeginInvoke()
    Start-Sleep -Milliseconds 100

    & $probePath -BaseUrl $prefix -OutputPath $outputPath -DurationSeconds 4 -RequestTimeoutSeconds 1 | Out-Null

    $mock.EndInvoke($mockInvocation)
    if ($mock.Streams.Error.Count -gt 0) {
        throw 'Local mock endpoint failed during recovery-probe validation.'
    }
    $rows = @(Import-Csv -LiteralPath $outputPath)

    if ($rows.Count -lt 4) {
        throw 'Recovery probe did not write enough local mock observations.'
    }
    if (@($rows | Where-Object { $_.endpoint -notin @('/health', '/ready') }).Count -ne 0) {
        throw 'Recovery probe wrote an unexpected endpoint value.'
    }
    if (@($rows | Where-Object { $_.outcome -eq 'failure' -and $_.http_status -eq '503' }).Count -lt 1) {
        throw 'Recovery probe did not retain a local HTTP failure status.'
    }
    if (@($rows | Where-Object { $_.outcome -eq 'failure' -and [string]::IsNullOrEmpty($_.http_status) }).Count -lt 1) {
        throw 'Recovery probe did not retain a local connection failure.'
    }
    $firstHealth = [DateTimeOffset]::Parse(($rows | Where-Object { $_.endpoint -eq '/health' } | Select-Object -First 1).timestamp_utc)
    $firstReady = [DateTimeOffset]::Parse(($rows | Where-Object { $_.endpoint -eq '/ready' } | Select-Object -First 1).timestamp_utc)
    if ([Math]::Abs(($firstHealth - $firstReady).TotalMilliseconds) -gt 250) {
        throw 'Recovery probe did not start and complete the endpoint pair concurrently.'
    }
    $healthRows = @($rows | Where-Object { $_.endpoint -eq '/health' })
    if ($healthRows.Count -lt 10) {
        throw 'Recovery probe did not poll at the requested high frequency.'
    }
    $firstHealthTimestamp = [DateTimeOffset]::Parse($healthRows[0].timestamp_utc)
    $secondHealthTimestamp = [DateTimeOffset]::Parse($healthRows[1].timestamp_utc)
    if (($secondHealthTimestamp - $firstHealthTimestamp).TotalMilliseconds -gt 100) {
        throw 'Recovery probe did not start health checks every 10 milliseconds.'
    }
    if (@($rows | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name | Where-Object {
        $_ -match '(?i)(url|body|header|ip|token|session|coordinate)'
    }).Count -ne 0) {
        throw 'Recovery probe CSV contains a prohibited field.'
    }

    Write-Output 'PASS: recovery probe handled local success, HTTP failure, connection failure, and 10-millisecond polling without unsafe fields.'
}
finally {
    if ($null -ne $mock) {
        $mock.Dispose()
    }
    if (Test-Path -LiteralPath $outputPath) {
        Remove-Item -LiteralPath $outputPath -Force
    }
}
