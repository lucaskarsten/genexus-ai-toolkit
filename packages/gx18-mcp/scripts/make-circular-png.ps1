# Applies a circular alpha mask to icon-source.png so the corners become transparent.
# The source art is a centered circular badge on an opaque white background (24bpp, no
# alpha) — without masking, the ICO shows a white square behind the round icon on the
# taskbar. Output is a 32bpp RGBA PNG with anti-aliased circular edge.
param(
    [Parameter(Mandatory = $true)] [string] $InPath,
    [Parameter(Mandatory = $true)] [string] $OutPath,
    [int] $Size = 0   # 0 = keep source dimensions; otherwise output a square Size×Size
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile($InPath)
try {
    $w = if ($Size -gt 0) { $Size } else { $src.Width }
    $h = if ($Size -gt 0) { $Size } else { $src.Height }

    $dst = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $g = [System.Drawing.Graphics]::FromImage($dst)
        try {
            $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.Clear([System.Drawing.Color]::Transparent)

            # Clip to a full-bleed circle, then draw the source through it.
            $path = New-Object System.Drawing.Drawing2D.GraphicsPath
            $path.AddEllipse(0, 0, $w, $h)
            $g.SetClip($path)
            $g.DrawImage($src, 0, 0, $w, $h)
            $path.Dispose()
        } finally { $g.Dispose() }

        $dst.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Host "Circular RGBA written: $OutPath ($w x $h)"
    } finally { $dst.Dispose() }
} finally { $src.Dispose() }
