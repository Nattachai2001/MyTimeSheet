import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function exportWorkbookToPdf(xlsxPath: string, pdfPath: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("PDF export is only supported on Windows with Microsoft Excel installed.");
  }

  await mkdir(path.dirname(pdfPath), { recursive: true });

  const resolvedXlsxPath = path.resolve(xlsxPath);
  const resolvedPdfPath = path.resolve(pdfPath);
  const script = `
$ErrorActionPreference = 'Stop'
$XlsxPath = ${quotePowerShellLiteral(resolvedXlsxPath)}
$PdfPath = ${quotePowerShellLiteral(resolvedPdfPath)}
$excel = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open($XlsxPath, 0, $true)
  $xlTypePDF = 0
  $workbook.ExportAsFixedFormat($xlTypePDF, $PdfPath)
  $workbook.Close($false)
} finally {
  if ($null -ne $excel) {
    $excel.Quit()
  }
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
`;

  await runPowerShell(script);
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function runPowerShell(script: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true
    });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const detail = stderr.trim();
      if (/80040154|Class not registered|Excel\.Application/i.test(detail)) {
        reject(new Error("Microsoft Excel is required to export PDF on this computer."));
        return;
      }

      reject(new Error(detail || `PDF export failed with exit code ${code ?? "unknown"}`));
    });
  });
}
