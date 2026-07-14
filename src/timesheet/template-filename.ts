const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function templateFilenameForMonth(month: string): string {
  const [year, monthText] = month.split("-");
  const monthNumber = Number(monthText);
  const shortMonth = monthNames[monthNumber - 1];
  if (!shortMonth || !year) {
    throw new Error(`Invalid month: ${month}`);
  }
  return `${monthNumber}. ${shortMonth} ${year} - TimeSheet_Template - Skilllane.xlsx`;
}
