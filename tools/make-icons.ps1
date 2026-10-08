# Generates icons/icon-192.png and icons/icon-512.png.
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
New-Item -ItemType Directory -Force (Join-Path $root 'icons') | Out-Null

foreach ($size in 192, 512) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(20, 23, 28))

  $u = $size / 16.0
  # Consistency bar: red -> yellow -> green gradient, rounded
  $rect = New-Object System.Drawing.RectangleF (3 * $u), (10 * $u), (10 * $u), (1.6 * $u)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(224, 86, 86)), ([System.Drawing.Color]::FromArgb(76, 175, 122)), 0.0
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $blend.Colors = @([System.Drawing.Color]::FromArgb(224, 86, 86), [System.Drawing.Color]::FromArgb(232, 212, 77), [System.Drawing.Color]::FromArgb(76, 175, 122))
  $blend.Positions = @(0.0, 0.5, 1.0)
  $brush.InterpolationColors = $blend
  $g.FillRectangle($brush, $rect)

  # Check mark
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(232, 235, 240)), (1.3 * $u)
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $pts = @(
    (New-Object System.Drawing.PointF (5 * $u), (6 * $u)),
    (New-Object System.Drawing.PointF (7 * $u), (8 * $u)),
    (New-Object System.Drawing.PointF (11 * $u), (4 * $u))
  )
  $g.DrawLines($pen, $pts)

  $bmp.Save((Join-Path $root "icons\icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Write-Output 'Icons written.'
