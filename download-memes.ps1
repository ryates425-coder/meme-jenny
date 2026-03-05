$memes = @(
    @{ name = "drake-hotline-bling"; url = "https://i.imgflip.com/30b1gx.jpg" },
    @{ name = "two-buttons"; url = "https://i.imgflip.com/1g8my4.jpg" },
    @{ name = "distracted-boyfriend"; url = "https://i.imgflip.com/1ur9b0.jpg" },
    @{ name = "bernie-asking"; url = "https://i.imgflip.com/3oevdk.jpg" },
    @{ name = "uno-draw-25"; url = "https://i.imgflip.com/3lmzyx.jpg" },
    @{ name = "left-exit-12"; url = "https://i.imgflip.com/22bdq6.jpg" },
    @{ name = "anakin-padme"; url = "https://i.imgflip.com/5c7lwq.png" },
    @{ name = "always-has-been"; url = "https://i.imgflip.com/46e43q.png" },
    @{ name = "disaster-girl"; url = "https://i.imgflip.com/23ls.jpg" },
    @{ name = "this-is-fine"; url = "https://i.imgflip.com/wxica.jpg" },
    @{ name = "mocking-spongebob"; url = "https://i.imgflip.com/1otk96.jpg" },
    @{ name = "change-my-mind"; url = "https://i.imgflip.com/24y43o.jpg" },
    @{ name = "waiting-skeleton"; url = "https://i.imgflip.com/2fm6x.jpg" },
    @{ name = "batman-slapping-robin"; url = "https://i.imgflip.com/9ehk.jpg" },
    @{ name = "woman-yelling-at-cat"; url = "https://i.imgflip.com/345v97.jpg" },
    @{ name = "one-does-not-simply"; url = "https://i.imgflip.com/1bij.jpg" },
    @{ name = "success-kid"; url = "https://i.imgflip.com/1bhk.jpg" },
    @{ name = "ancient-aliens"; url = "https://i.imgflip.com/26am.jpg" },
    @{ name = "surprised-pikachu"; url = "https://i.imgflip.com/2kbn1e.jpg" },
    @{ name = "two-guys-on-bus"; url = "https://i.imgflip.com/5v6gwj.jpg" }
)
$outDir = "images"
foreach ($m in $memes) {
    $ext = if ($m.url -match "\.png") { ".png" } else { ".jpg" }
    $path = Join-Path $outDir "$($m.name)$ext"
    Write-Host "Downloading $($m.name)..."
    Invoke-WebRequest -Uri $m.url -OutFile $path -UseBasicParsing
}
Write-Host "Done! Downloaded $($memes.Count) memes to $outDir"
