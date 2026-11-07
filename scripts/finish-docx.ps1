# Updates a report's contents and lists in Word, saves it, then exports a PDF and prints the page count.
param([Parameter(Mandatory)][string]$Path)
$full = (Resolve-Path $Path).Path
$pdf = [IO.Path]::ChangeExtension($full, '.pdf')
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($full, $false, $false, $false)
  # Twice: the first pass can shift pages, so page numbers settle on the second.
  1..2 | ForEach-Object {
    foreach ($t in $doc.TablesOfContents) { $t.Update() }
    foreach ($t in $doc.TablesOfFigures) { $t.Update() }
  }
  $doc.Save()
  $doc.Close(0)

  # Exporting from the document just edited hangs Word when driven from PowerShell, so reopen it read-only.
  $doc = $word.Documents.Open($full, $false, $true, $false)
  "$(Split-Path -Leaf $full): $($doc.ComputeStatistics(2)) pages, $($doc.ComputeStatistics(0)) words"
  $doc.SaveAs2($pdf, 17)
  $doc.Close(0)
} finally {
  $word.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
